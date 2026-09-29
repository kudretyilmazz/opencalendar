"use client";

import { useActionState } from "react";
import { Alert, Button, Card } from "@/components/ui/primitives";
import { type ActionState, idle } from "@/lib/actions";
import { respondToInvitationAction } from "../server/actions";

type Invitation = { id: string; teamName: string; role: string };

function Respond({ invitation }: { invitation: Invitation }) {
  const [acceptState, accept, accepting] = useActionState<ActionState>(respondToInvitationAction.bind(null, invitation.id, true), idle);
  const [declineState, decline, declining] = useActionState<ActionState>(respondToInvitationAction.bind(null, invitation.id, false), idle);
  const state = acceptState.message ? acceptState : declineState;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-sm">
        You’re invited to join <strong>{invitation.teamName}</strong> as {invitation.role}.
      </p>
      <div className="flex gap-2">
        <form action={accept}>
          <Button disabled={accepting || declining} aria-label={`Accept invitation to ${invitation.teamName}`}>
            Accept
          </Button>
        </form>
        <form action={decline}>
          <Button variant="secondary" disabled={accepting || declining} aria-label={`Decline invitation to ${invitation.teamName}`}>
            Decline
          </Button>
        </form>
      </div>
      {state.message && <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>}
    </Card>
  );
}

/** Invitations addressed to the signed-in user (TEAM-002). */
export function InvitationsList({ invitations }: { invitations: Invitation[] }) {
  if (!invitations.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">Invitations</h2>
      {invitations.map((i) => (
        <Respond key={i.id} invitation={i} />
      ))}
    </section>
  );
}
