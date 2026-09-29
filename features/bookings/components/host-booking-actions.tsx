"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Input } from "@/components/ui/primitives";
import { type ActionState, idle } from "@/lib/actions";
import { hostCancelAction } from "../server/host-actions";

export function HostBookingActions({ bookingId, attendeeName }: { bookingId: string; attendeeName: string }) {
  const [mode, setMode] = useState<"cancel" | "reschedule" | null>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(hostCancelAction, idle);

  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="h-9" onClick={() => setMode("reschedule")}>
          Request reschedule
        </Button>
        <Button type="button" variant="ghost" className="h-9" onClick={() => setMode("cancel")}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col gap-2 sm:w-80">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="mode" value={mode} />
      <label htmlFor={`reason-${bookingId}`} className="text-sm font-medium">
        {mode === "cancel" ? `Reason for cancelling (sent to ${attendeeName})` : `Message to ${attendeeName} (optional)`}
      </label>
      <Input id={`reason-${bookingId}`} name="reason" maxLength={500} />
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" className="h-9" disabled={pending}>
          {mode === "cancel" ? "Cancel booking" : "Send request"}
        </Button>
        <Button type="button" variant="ghost" className="h-9" onClick={() => setMode(null)}>
          Back
        </Button>
      </div>
    </form>
  );
}
