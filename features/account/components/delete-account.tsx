"use client";

import { useActionState, useEffect } from "react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { type ActionState, idle } from "@/lib/actions";
import { deleteAccountAction } from "../server/actions";

const dangerButtonClass = "h-10 rounded-md bg-destructive-soft px-3.5 text-destructive hover:bg-destructive-soft/80";

/** The typed-email confirmation form (inside the dialog). */
function DeleteAccountForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteAccountAction, idle);
  useEffect(() => {
    // Deliberately a full page load: nothing of the deleted account may survive in client state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (state.status === "success") window.location.assign("/?deleted=1");
  }, [state.status]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormField label={`Type ${email} to confirm`} htmlFor="confirm" error={state.fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" autoComplete="off" className="h-10 rounded-md" />
      </FormField>
      {state.status === "error" && !state.fieldErrors && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel className="h-10 rounded-md">Cancel</AlertDialogCancel>
        <Button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending && <Spinner />}
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

/** Danger-zone row: explains the consequences and opens the confirmation dialog. */
export function DeleteAccount({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-4 rounded-[12px] border border-destructive-border bg-card p-4 sm:flex-row sm:items-center md:px-6 md:py-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium">Delete account</span>
        <span className="text-[13px] text-muted-foreground">Cancels upcoming bookings, notifies invitees and removes your booking page.</span>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" className={dangerButtonClass}>
            Delete account…
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This cancels your upcoming bookings (invitees are notified) and permanently deletes your account, schedules, event types
              and bookings. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DeleteAccountForm email={email} />
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
