"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";
import { formatDateTimeRange, prefers12Hour } from "@/lib/format";
import { cancelBookingAction } from "../server/public-actions";

/** Booking time shown in the viewer's own zone and clock (BKG-007). */
export function LocalTime({ start, end }: { start: number; end: number }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const locale = navigator.language || "en-US";
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only formatting
    setLabel(`${formatDateTimeRange(start, end, { locale, timeZone, hour12: prefers12Hour(locale) })} (${timeZone.replaceAll("_", " ")})`);
  }, [start, end]);
  return <span suppressHydrationWarning>{label ?? new Date(start).toISOString().replace("T", " ").slice(0, 16) + " UTC"}</span>;
}

export function CancelBookingForm({ uid, token, label = "Cancel booking", series = false }: { uid: string; token: string; label?: string; series?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"booking" | "series">("booking");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "") || undefined;
    const result = await cancelBookingAction({ uid, token, reason, scope });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3">
      {series && (
        <fieldset className="flex flex-col gap-1.5 text-sm">
          <legend className="mb-1 font-medium">What do you want to cancel?</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="scope" checked={scope === "booking"} onChange={() => setScope("booking")} /> Only this occurrence
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="scope" checked={scope === "series"} onChange={() => setScope("series")} /> This and all remaining occurrences
          </label>
        </fieldset>
      )}
      <Field label="Reason for cancelling (optional)" htmlFor="reason">
        <Input id="reason" name="reason" maxLength={500} />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Cancelling…" : "Confirm cancellation"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Keep booking
        </Button>
      </div>
    </form>
  );
}
