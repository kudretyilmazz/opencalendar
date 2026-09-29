"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { decideBookingAction } from "@/features/bookings/server/decision-actions";
import { type ActionState, idle } from "@/lib/actions";

type Decision = "accept" | "reject";

const buttonClass = "h-11 rounded-md px-3.5 text-sm md:h-9 md:text-[13px]";

/**
 * One-click Accept / Decline for a pending booking on the dashboard (BKG-012). Declining here
 * sends no reason; the Bookings page still offers "Reject…" with a message for the invitee.
 * (Plain buttons rather than named submit buttons: React renders those differently on the
 * server and the client, which breaks hydration.)
 */
export function QuickDecision({ bookingId, label }: { bookingId: string; label: string }) {
  const [state, setState] = useState<ActionState>(idle);
  const [choice, setChoice] = useState<Decision | null>(null);
  const [pending, startTransition] = useTransition();

  const decide = (decision: Decision) => {
    setChoice(decision);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("bookingId", bookingId);
      formData.set("decision", decision);
      setState(await decideBookingAction(idle, formData));
    });
  };

  if (state.status === "success")
    return (
      <p role="status" className="text-[13px] text-muted-foreground">
        {state.message}
      </p>
    );

  return (
    <div className="flex flex-col gap-1.5 md:items-end">
      <div className="grid grid-cols-2 gap-2 md:flex">
        <Button type="button" variant="outline" disabled={pending} aria-label={`Decline ${label}`} className={`${buttonClass} bg-transparent`} onClick={() => decide("reject")}>
          {pending && choice === "reject" && <Spinner />}
          Decline
        </Button>
        <Button type="button" disabled={pending} aria-label={`Accept ${label}`} className={buttonClass} onClick={() => decide("accept")}>
          {pending && choice === "accept" && <Spinner />}
          Accept
        </Button>
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-xs text-destructive">
          {state.message}
        </p>
      )}
    </div>
  );
}
