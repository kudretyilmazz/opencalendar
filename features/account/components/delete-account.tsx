"use client";

import { useActionState, useEffect } from "react";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";
import { type ActionState, idle } from "@/lib/actions";
import { deleteAccountAction } from "../server/actions";

export function DeleteAccountForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteAccountAction, idle);
  useEffect(() => {
    // Deliberately a full page load: nothing of the deleted account may survive in client state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (state.status === "success") window.location.assign("/?deleted=1");
  }, [state.status]);
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        This cancels your upcoming bookings (invitees are notified) and permanently deletes your account, schedules, event types
        and bookings. This cannot be undone.
      </p>
      <Field label={`Type ${email} to confirm`} htmlFor="confirm" error={state.fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" autoComplete="off" />
      </Field>
      {state.status === "error" && !state.fieldErrors && <Alert tone="error">{state.message}</Alert>}
      <Button type="submit" disabled={pending} className="self-start bg-danger text-white">
        {pending ? "Deleting…" : "Delete my account"}
      </Button>
    </form>
  );
}
