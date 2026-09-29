"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";
import { type ActionState, idle } from "@/lib/actions";
import { decideBookingAction, decideBySignatureAction } from "../server/decision-actions";

type Signed = { uid: string; exp: string; sig: string };

/**
 * Accept/reject a pending booking (BKG-012), either from the dashboard (signed in) or from the
 * signed email link (`signed`, which is valid for its one action only). Rejecting takes an
 * optional reason for the invitee.
 */
export function DecisionForm({ bookingId, signed, initial = "accept" }: { bookingId?: string; signed?: Signed; initial?: "accept" | "reject" }) {
  const [decision, setDecision] = useState<"accept" | "reject">(initial);
  const [state, action, pending] = useActionState<ActionState, FormData>(signed ? decideBySignatureAction : decideBookingAction, idle);

  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;

  return (
    <form action={action} className="flex flex-col gap-3">
      {signed ? (
        <>
          <input type="hidden" name="uid" value={signed.uid} />
          <input type="hidden" name="exp" value={signed.exp} />
          <input type="hidden" name="sig" value={signed.sig} />
        </>
      ) : (
        <input type="hidden" name="bookingId" value={bookingId} />
      )}
      <input type="hidden" name="decision" value={decision} />
      {decision === "reject" && (
        <Field label="Reason (sent to the invitee, optional)" htmlFor={`reason-${bookingId ?? signed?.uid}`}>
          <Input id={`reason-${bookingId ?? signed?.uid}`} name="reason" maxLength={500} />
        </Field>
      )}
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}
      <div className="flex flex-wrap gap-2">
        {decision === "accept" ? (
          <>
            <Button type="submit" className="h-9" disabled={pending}>
              Accept
            </Button>
            {!signed && (
              <Button type="button" variant="secondary" className="h-9" onClick={() => setDecision("reject")}>
                Reject…
              </Button>
            )}
          </>
        ) : (
          <>
            <Button type="submit" className="h-9 bg-danger text-white" disabled={pending}>
              Reject booking
            </Button>
            {!signed && (
              <Button type="button" variant="ghost" className="h-9" onClick={() => setDecision("accept")}>
                Back
              </Button>
            )}
          </>
        )}
      </div>
    </form>
  );
}
