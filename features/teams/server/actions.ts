"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromDrizzle } from "pg-boss";
import { getDb, type Tx } from "@/db/client";
import { invalidatePublicContext } from "@/features/bookings/server/public-context";
import { eventTypeFormSchema } from "@/features/event-types/schemas";
import { type ActionState, parsePayload } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { cipherFromEnv } from "@/lib/crypto/encryption";
import { getEnv } from "@/lib/env";
import { enqueue } from "@/lib/jobs/enqueue";
import { sealEmail } from "@/lib/jobs/queues";
import { logger } from "@/lib/logger";
import { hostsSchema, inviteSchema, managedSchema, removeMemberSchema, roleChangeSchema, SCHEDULING_TYPES, type SchedulingType, teamFormSchema } from "../schemas";
import { TeamError } from "./access";
import { createTeamEventType, deleteTeamEventType, setHosts, setManaged, setTeamEventTypeEnabled, updateTeamEventType } from "./event-types";
import { removeMember } from "./removal";
import { acceptInvitation, cancelInvitation, changeRole, createTeam, declineInvitation, deleteTeam, inviteMember, updateTeam } from "./service";

/** Team server actions (TEAM-001…008). Authentication here; roles are checked in the services. */

const FAILED = "Please fix the highlighted fields.";

const MESSAGES: Record<TeamError["code"], ActionState> = {
  NOT_FOUND: { status: "error", message: "This team or item no longer exists." },
  FORBIDDEN: { status: "error", message: "Your role in this team doesn't allow that." },
  SLUG_TAKEN: { status: "error", message: FAILED, fieldErrors: { slug: "This URL is already taken" } },
  LAST_OWNER: { status: "error", message: "A team needs at least one owner. Make someone else an owner first." },
  ALREADY_MEMBER: { status: "error", message: FAILED, fieldErrors: { email: "Already a member of this team" } },
  INVITATION_NOT_FOUND: { status: "error", message: "This invitation is no longer valid." },
  MEMBER_NOT_FOUND: { status: "error", message: "This person is no longer a member." },
  NOT_A_HOST: { status: "error", message: "Hosts must be members of the team." },
  EMAIL_NOT_VERIFIED: { status: "error", message: "Verify your email address first." },
  RATE_LIMITED: { status: "error", message: "Too many invitations. Please wait a while, or cancel pending ones first." },
};

const message = (error: TeamError): ActionState => {
  if (error.code === "FORBIDDEN" && error.detail === "has_upcoming_bookings") {
    return { status: "error", message: "There are upcoming bookings. Turn it off instead, or cancel those bookings first." };
  }
  return MESSAGES[error.code];
};

async function run(fn: () => Promise<void>, success?: string): Promise<ActionState> {
  try {
    await fn();
    return success ? { status: "success", message: success } : { status: "idle" };
  } catch (error) {
    if (error instanceof TeamError) return message(error);
    throw error;
  }
}

const teamPath = (teamId: string) => `/teams/${teamId}`;

// ---------------------------------------------------------------------------- teams

export async function createTeamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, teamFormSchema);
  if (!parsed.ok) return parsed.state;
  let id = "";
  const state = await run(async () => {
    id = await createTeam(getDb(), user.id, parsed.data);
  });
  if (state.status === "error") return state;
  redirect(teamPath(id));
}

export async function updateTeamAction(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, teamFormSchema);
  if (!parsed.ok) return parsed.state;
  const state = await run(() => updateTeam(getDb(), user.id, teamId, parsed.data), "Team saved.");
  invalidatePublicContext();
  revalidatePath(teamPath(teamId));
  return state;
}

export async function deleteTeamAction(teamId: string, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  const state = await run(() => deleteTeam(getDb(), user.id, teamId, Date.now()));
  if (state.status === "error") return state;
  invalidatePublicContext();
  redirect("/teams");
}

// ---------------------------------------------------------------------------- members

export async function inviteMemberAction(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, inviteSchema);
  if (!parsed.ok) return parsed.state;
  const state = await run(async () => {
    const invite = await inviteMember(getDb(), user.id, teamId, parsed.data, Date.now());
    const env = getEnv();
    const email = sealEmail(cipherFromEnv(env), {
      to: parsed.data.email,
      template: "team-invitation",
      props: { teamName: invite.teamName, inviterName: invite.inviterName, role: parsed.data.role, url: `${env.APP_URL}/teams` },
    });
    await enqueue("emailSend", email);
  }, `Invitation sent to ${parsed.data.email}.`);
  revalidatePath(teamPath(teamId));
  return state;
}

export async function cancelInvitationAction(teamId: string, invitationId: string): Promise<void> {
  const user = await requireUser();
  await run(() => cancelInvitation(getDb(), user.id, teamId, invitationId));
  revalidatePath(teamPath(teamId));
}

export async function respondToInvitationAction(invitationId: string, accept: boolean, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  const invitee = { id: user.id, email: user.email, emailVerified: user.emailVerified };
  let teamId = "";
  const state = await run(async () => {
    if (accept) teamId = await acceptInvitation(getDb(), invitee, invitationId, Date.now());
    else await declineInvitation(getDb(), invitee, invitationId, Date.now());
  });
  if (state.status === "error") return state;
  if (accept) redirect(teamPath(teamId));
  revalidatePath("/teams");
  return { status: "success", message: "Invitation declined." };
}

export async function changeRoleAction(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, roleChangeSchema);
  if (!parsed.ok) return parsed.state;
  const state = await run(() => changeRole(getDb(), user.id, teamId, parsed.data.userId, parsed.data.role), "Role updated.");
  revalidatePath(teamPath(teamId));
  return state;
}

/** Follow-ups run in the removal transaction: emails and calendar moves through the booking job. */
const bookingJob = (event: "cancelled" | "reassigned") => async (tx: Tx, row: { id: string }) => {
  await enqueue("bookingProcess", { bookingId: row.id, event }, { db: fromDrizzle(tx, sql) });
};

export async function removeMemberAction(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, removeMemberSchema);
  if (!parsed.ok) return parsed.state;
  let summary = "";
  const state = await run(async () => {
    const result = await removeMember(
      getDb(),
      { actorId: user.id, teamId, userId: parsed.data.userId, futureBookings: parsed.data.futureBookings, now: Date.now() },
      { onCancelled: bookingJob("cancelled"), onReassigned: bookingJob("reassigned") },
    );
    logger.info("team.member_removed", { teamId, ...result });
    summary = `Removed. ${result.reassigned} booking(s) reassigned, ${result.cancelled} cancelled.`;
  });
  if (state.status === "error") return state;
  invalidatePublicContext();
  if (parsed.data.userId === user.id) redirect("/teams");
  revalidatePath(teamPath(teamId));
  return { status: "success", message: summary };
}

// ---------------------------------------------------------------------------- team event types

export async function createTeamEventTypeAction(teamId: string, type: SchedulingType, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!SCHEDULING_TYPES.includes(type)) return { status: "error", message: "Unknown event type kind." };
  const parsed = parsePayload(formData, eventTypeFormSchema);
  if (!parsed.ok) return parsed.state;
  let id = "";
  const state = await run(async () => {
    id = await createTeamEventType(getDb(), user.id, teamId, type, parsed.data);
  });
  if (state.status === "error") return state;
  invalidatePublicContext();
  redirect(`${teamPath(teamId)}/event-types/${id}`);
}

export async function saveTeamEventTypeAction(teamId: string, id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, eventTypeFormSchema);
  if (!parsed.ok) return parsed.state;
  const state = await run(() => updateTeamEventType(getDb(), user.id, teamId, id, parsed.data), "Saved.");
  invalidatePublicContext();
  revalidatePath(`${teamPath(teamId)}/event-types/${id}`);
  return state;
}

export async function toggleTeamEventTypeAction(teamId: string, id: string, enabled: boolean): Promise<void> {
  const user = await requireUser();
  await run(() => setTeamEventTypeEnabled(getDb(), user.id, teamId, id, enabled));
  invalidatePublicContext();
  revalidatePath(teamPath(teamId));
}

export async function deleteTeamEventTypeAction(teamId: string, id: string, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  const state = await run(() => deleteTeamEventType(getDb(), user.id, teamId, id, Date.now()));
  if (state.status === "error") return state;
  invalidatePublicContext();
  redirect(teamPath(teamId));
}

export async function saveHostsAction(teamId: string, id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, hostsSchema);
  if (!parsed.ok) return parsed.state;
  const state = await run(() => setHosts(getDb(), user.id, teamId, id, parsed.data), "Hosts saved.");
  invalidatePublicContext();
  revalidatePath(`${teamPath(teamId)}/event-types/${id}`);
  return state;
}

export async function saveManagedAction(teamId: string, id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, managedSchema);
  if (!parsed.ok) return parsed.state;
  let detached: string[] = [];
  const state = await run(async () => {
    detached = (await setManaged(getDb(), user.id, teamId, id, { ...parsed.data, now: Date.now() })).detached;
  }, "Assignments saved.");
  invalidatePublicContext();
  revalidatePath(`${teamPath(teamId)}/event-types/${id}`);
  if (state.status === "success" && detached.length) {
    return { status: "success", message: `Saved. ${detached.length} member copy(ies) with upcoming bookings were kept as personal event types.` };
  }
  return state;
}
