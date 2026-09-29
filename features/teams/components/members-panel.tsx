"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import type { ActionState } from "@/lib/actions";
import { TEAM_ROLES, type TeamRole } from "../roles";
import { PayloadForm } from "./payload-form";

type Member = { userId: string; name: string; email: string; role: TeamRole };
type Invitation = { id: string; email: string; role: TeamRole; expires: string };

type Actions = {
  changeRole: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  remove: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  invite: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  cancelInvitation: (invitationId: string) => Promise<void>;
};

function MemberRow({ member, canManage, isSelf, actions }: { member: Member; canManage: boolean; isSelf: boolean; actions: Actions }) {
  const [role, setRole] = useState<TeamRole>(member.role);
  const [futureBookings, setFutureBookings] = useState<"reassign" | "cancel">("reassign");
  const id = member.userId;
  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-3 text-sm">
      <div>
        <p className="font-medium">
          {member.name}
          {isSelf && <span className="text-muted"> (you)</span>}
        </p>
        <p className="text-muted">
          {member.email} · {member.role}
        </p>
      </div>
      {canManage && (
        <div className="flex flex-wrap items-end gap-4">
          <PayloadForm action={actions.changeRole} payload={{ userId: id, role }} submitLabel="Change role" variant="secondary" className="flex flex-wrap items-end gap-2">
            {() => (
              <Field label="Role" htmlFor={`role-${id}`}>
                <Select id={`role-${id}`} value={role} onChange={(e) => setRole(e.target.value as TeamRole)} className="w-32">
                  {TEAM_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </PayloadForm>
          <PayloadForm
            action={actions.remove}
            payload={{ userId: id, futureBookings }}
            submitLabel={isSelf ? "Leave team" : "Remove"}
            submitAriaLabel={isSelf ? "Leave team" : `Remove ${member.name}`}
            variant="ghost"
            className="flex flex-wrap items-end gap-2"
          >
            {() => (
              <Field label="Their future team bookings" htmlFor={`future-${id}`}>
                <Select id={`future-${id}`} value={futureBookings} onChange={(e) => setFutureBookings(e.target.value as "reassign" | "cancel")} className="w-56">
                  <option value="reassign">Reassign to other hosts</option>
                  <option value="cancel">Cancel them</option>
                </Select>
              </Field>
            )}
          </PayloadForm>
        </div>
      )}
    </li>
  );
}

/** Members, roles, invitations (TEAM-002/003). Buttons follow the role; the server re-checks. */
export function MembersPanel({ members, invitations, selfId, canManage, actions }: { members: Member[]; invitations: Invitation[]; selfId: string; canManage: boolean; actions: Actions }) {
  const [invite, setInvite] = useState<{ email: string; role: TeamRole }>({ email: "", role: "member" });
  const self = members.find((m) => m.userId === selfId);
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-medium">Members</h2>
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <MemberRow key={m.userId} member={m} canManage={canManage} isSelf={m.userId === selfId} actions={actions} />
        ))}
      </ul>
      {!canManage && self && (
        <PayloadForm action={actions.remove} payload={{ userId: selfId, futureBookings: "reassign" }} submitLabel="Leave team" variant="secondary" />
      )}
      {canManage && (
        <>
          <h3 className="text-sm font-medium">Invite someone</h3>
          <PayloadForm action={actions.invite} payload={invite} submitLabel="Send invitation" className="flex flex-col gap-3">
            {(errors) => (
              <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                <Field label="Email" htmlFor="invite-email" error={errors.email}>
                  <Input id="invite-email" type="email" value={invite.email} onChange={(e) => setInvite((v) => ({ ...v, email: e.target.value }))} />
                </Field>
                <Field label="Role" htmlFor="invite-role">
                  <Select id="invite-role" value={invite.role} onChange={(e) => setInvite((v) => ({ ...v, role: e.target.value as TeamRole }))}>
                    {TEAM_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </PayloadForm>
          {invitations.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm">
              {invitations.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border p-2">
                  <span>
                    {i.email} · {i.role} · pending until {i.expires}
                  </span>
                  <form action={actions.cancelInvitation.bind(null, i.id)}>
                    <Button variant="ghost" className="h-8" aria-label={`Cancel invitation for ${i.email}`}>
                      Cancel
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
