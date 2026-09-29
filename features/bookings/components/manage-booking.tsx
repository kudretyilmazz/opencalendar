"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
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
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
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
        <FieldSet className="gap-1.5">
          <FieldLegend variant="label" className="mb-1">
            What do you want to cancel?
          </FieldLegend>
          <RadioGroup name="scope" value={scope} onValueChange={(v) => setScope(v === "series" ? "series" : "booking")}>
            <Field orientation="horizontal">
              <RadioGroupItem id="scope-booking" value="booking" />
              <FieldLabel htmlFor="scope-booking" className="font-normal">
                Only this occurrence
              </FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem id="scope-series" value="series" />
              <FieldLabel htmlFor="scope-series" className="font-normal">
                This and all remaining occurrences
              </FieldLabel>
            </Field>
          </RadioGroup>
        </FieldSet>
      )}
      <FormField label="Reason for cancelling (optional)" htmlFor="reason">
        <Input id="reason" name="reason" maxLength={500} />
      </FormField>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Cancelling…" : "Confirm cancellation"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Keep booking
        </Button>
      </div>
    </form>
  );
}
