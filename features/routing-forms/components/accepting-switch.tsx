"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setRoutingFormAcceptingAction } from "../server/actions";

/** The overview's "Accepting" toggle: opens or closes a form for new responses right away. */
export function AcceptingSwitch({ formId, name, accepting }: { formId: string; name: string; accepting: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(accepting);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (next: boolean) => {
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      const state = await setRoutingFormAcceptingAction(formId, next);
      if (state.status === "error") setError(state.message ?? "That didn't work.");
    });
  };

  return (
    <div className="flex flex-col gap-1">
      {/* 44px touch target around the 36×20 switch. */}
      <label className="-m-3 flex min-h-11 w-fit cursor-pointer items-center p-3">
        <Switch checked={optimistic} disabled={pending} onCheckedChange={toggle} aria-label={`${name} accepts responses`} />
      </label>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
