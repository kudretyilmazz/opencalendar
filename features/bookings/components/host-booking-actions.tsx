"use client";

import { useActionState, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { type ActionState, idle } from "@/lib/actions";
import { cn } from "@/lib/cn";
import { hostCancelAction, requestRescheduleAction } from "../server/host-actions";

/** The design's small row button: 36px (44px touch target on phones). */
const rowButton = "h-11 rounded-md px-3.5 text-sm md:h-9 md:text-[13px]";

type Invitee = { name: string; email: string };

/**
 * Asks the invitee to pick a new time (BKG-010). Says plainly that an email goes out and that the
 * meeting is not cancelled, and only sends after the host confirms in the dialog.
 */
function RequestReschedule({ bookingId, invitee, onSent }: { bookingId: string; invitee: Invitee; onSent: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await requestRescheduleAction(prev, formData);
    if (result.status === "success") {
      setOpen(false);
      onSent(result.message ?? "");
    }
    return result;
  }, idle);
  const inputId = `reschedule-message-${bookingId}`;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" className={cn(rowButton, "bg-card")}>
          Request reschedule
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Email {invitee.name} to pick a new time?</AlertDialogTitle>
          <AlertDialogDescription>
            {invitee.name} ({invitee.email}) will get an email asking them to choose a new date and time for this meeting, with a
            link to do it. The meeting is not cancelled: it stays booked for its current time until they pick a new one, then it
            moves and everyone gets the updated invitation.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="bookingId" value={bookingId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId}>Message to {invitee.name} (optional, included in the email)</Label>
            <Input id={inputId} name="reason" maxLength={500} placeholder="e.g. Something came up on my side, sorry!" />
          </div>
          {state.status === "error" && (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 rounded-md">Don&rsquo;t send</AlertDialogCancel>
            <Button type="submit" disabled={pending} className="h-10 rounded-md">
              {pending && <Spinner />}
              {pending ? "Sending…" : "Send email"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Request a new time or cancel an upcoming booking from the host's dashboard (BKG-010). */
export function HostBookingActions({ bookingId, invitee, canReschedule }: { bookingId: string; invitee: Invitee; canReschedule: boolean }) {
  const [cancelling, setCancelling] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(hostCancelAction, idle);

  if (!cancelling) {
    return (
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2 md:flex">
          {canReschedule && <RequestReschedule bookingId={bookingId} invitee={invitee} onSent={setSent} />}
          <Button
            type="button"
            variant="destructive"
            className={cn(rowButton, "bg-destructive-soft hover:bg-destructive-soft/80")}
            onClick={() => setCancelling(true)}
          >
            Cancel booking
          </Button>
        </div>
        {sent && (
          <Alert variant="success" className="md:max-w-md">
            <AlertDescription>{sent}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col gap-2 md:max-w-sm">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Label htmlFor={`reason-${bookingId}`}>Reason for cancelling (sent to {invitee.name})</Label>
      <Input id={`reason-${bookingId}`} name="reason" maxLength={500} />
      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" className={rowButton} disabled={pending}>
          {pending && <Spinner />}
          Cancel booking
        </Button>
        <Button type="button" variant="ghost" className={rowButton} onClick={() => setCancelling(false)}>
          Back
        </Button>
      </div>
    </form>
  );
}
