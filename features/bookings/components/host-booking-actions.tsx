"use client";

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { type ActionState, idle } from "@/lib/actions";
import { cn } from "@/lib/cn";
import { hostCancelAction } from "../server/host-actions";

/** The design's small row button: 36px (44px touch target on phones). */
const rowButton = "h-11 rounded-md px-3.5 text-sm md:h-9 md:text-[13px]";

/** Request a reschedule or cancel an upcoming booking from the host's dashboard (BKG-010). */
export function HostBookingActions({ bookingId, attendeeName }: { bookingId: string; attendeeName: string }) {
  const [mode, setMode] = useState<"cancel" | "reschedule" | null>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(hostCancelAction, idle);

  if (!mode) {
    return (
      <div className="grid grid-cols-2 gap-2 md:flex">
        <Button
          type="button"
          variant="outline"
          className={cn(rowButton, "bg-card")}
          onClick={() => setMode("reschedule")}
        >
          Request reschedule
        </Button>
        <Button
          type="button"
          variant="destructive"
          className={cn(rowButton, "bg-destructive-soft hover:bg-destructive-soft/80")}
          onClick={() => setMode("cancel")}
        >
          Cancel booking
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col gap-2 md:max-w-sm">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="mode" value={mode} />
      <Label htmlFor={`reason-${bookingId}`}>
        {mode === "cancel"
          ? `Reason for cancelling (sent to ${attendeeName})`
          : `Message to ${attendeeName} (optional)`}
      </Label>
      <Input id={`reason-${bookingId}`} name="reason" maxLength={500} />
      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant={mode === "cancel" ? "destructive" : "default"}
          className={rowButton}
          disabled={pending}
        >
          {pending && <Spinner />}
          {mode === "cancel" ? "Cancel booking" : "Send request"}
        </Button>
        <Button type="button" variant="ghost" className={rowButton} onClick={() => setMode(null)}>
          Back
        </Button>
      </div>
    </form>
  );
}
