"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { type ActionState, idle } from "@/lib/actions";
import { initials } from "../overview";
import { respondToInvitationAction } from "../server/actions";

type Invitation = { id: string; teamName: string; role: string; inviterName: string | null };

const article = (role: string) => (role === "admin" || role === "owner" ? "an" : "a");

function Respond({ invitation }: { invitation: Invitation }) {
  const [acceptState, accept, accepting] = useActionState<ActionState>(
    respondToInvitationAction.bind(null, invitation.id, true),
    idle,
  );
  const [declineState, decline, declining] = useActionState<ActionState>(
    respondToInvitationAction.bind(null, invitation.id, false),
    idle,
  );
  const state = acceptState.message ? acceptState : declineState;
  const busy = accepting || declining;
  return (
    <section
      aria-label={`Invitation to ${invitation.teamName}`}
      className="flex flex-col gap-3 rounded-[12px] border border-highlight-border bg-highlight-soft px-4 py-4 md:px-5"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-3.5">
        <div className="flex flex-1 items-center gap-3.5">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
          >
            {initials(invitation.inviterName ?? invitation.teamName)}
          </span>
          <p className="text-sm">
            {invitation.inviterName ? (
              <>
                <strong className="font-semibold">{invitation.inviterName}</strong> invited you to join{" "}
              </>
            ) : (
              "You’re invited to join "
            )}
            <strong className="font-semibold">{invitation.teamName}</strong> as {article(invitation.role)}{" "}
            {invitation.role}.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <form action={decline} className="contents">
            <Button
              variant="outline"
              disabled={busy}
              aria-label={`Decline invitation to ${invitation.teamName}`}
              className="h-11 rounded-md bg-card px-3.5 text-[13px] md:h-9"
            >
              Decline
            </Button>
          </form>
          <form action={accept} className="contents">
            <Button
              disabled={busy}
              aria-label={`Accept invitation to ${invitation.teamName}`}
              className="h-11 rounded-md px-3.5 text-[13px] md:h-9"
            >
              Accept invitation
            </Button>
          </form>
        </div>
      </div>
      {state.message && (
        <Alert variant={state.status === "error" ? "destructive" : "success"}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}

/** Invitations addressed to the signed-in user (TEAM-002), one banner each. */
export function InvitationsList({ invitations }: { invitations: Invitation[] }) {
  if (!invitations.length) return null;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="sr-only">Invitations</h2>
      {invitations.map((i) => (
        <Respond key={i.id} invitation={i} />
      ))}
    </div>
  );
}
