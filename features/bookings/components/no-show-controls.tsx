"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { noShowAction } from "../server/decision-actions";

type Person = { id: string; label: string; noShow: boolean };

/** BKG-013: toggles no-show for the host and each attendee of a past booking. */
export function NoShowControls({ bookingId, host, attendees }: { bookingId: string; host: { noShow: boolean }; attendees: Person[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const people: Person[] = [{ id: "host", label: "You (host)", noShow: host.noShow }, ...attendees];

  const toggle = (target: string, noShow: boolean) =>
    startTransition(async () => {
      const result = await noShowAction({ bookingId, target, noShow });
      setError(result.status === "error" ? (result.message ?? "That didn't work.") : null);
    });

  return (
    <FieldSet className="gap-1.5" disabled={pending}>
      <FieldLegend variant="label" className="mb-1">
        No-show
      </FieldLegend>
      {people.map((p) => (
        <Field key={p.id} orientation="horizontal" data-disabled={pending || undefined}>
          <Checkbox id={`no-show-${bookingId}-${p.id}`} defaultChecked={p.noShow} onCheckedChange={(checked) => toggle(p.id, checked === true)} />
          <FieldLabel htmlFor={`no-show-${bookingId}-${p.id}`} className="font-normal">
            {p.label}
          </FieldLabel>
        </Field>
      ))}
      {error && <FieldError>{error}</FieldError>}
    </FieldSet>
  );
}
