"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import type { ActionState } from "@/lib/actions";
import { LOCKABLE_LABELS, type LockableField } from "../schemas";
import { PayloadForm } from "./payload-form";

type Member = { userId: string; name: string };

/** Managed event type (TEAM-008): who gets a copy, and which fields they can't change. */
export function ManagedPanel({
  members,
  assignees,
  lockedFields,
  action,
}: {
  members: Member[];
  assignees: string[];
  lockedFields: LockableField[];
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [assigned, setAssigned] = useState(new Set(assignees));
  const [locked, setLocked] = useState(new Set(lockedFields));
  const flip = <T,>(set: Set<T>, value: T, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(value);
    else next.delete(value);
    return next;
  };
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Assignment and locked fields</h2>
      <p className="text-sm text-muted-foreground">
        Each assigned member gets their own copy at their own URL. Locked fields always follow this template; members
        can change the rest.
      </p>
      <PayloadForm
        action={action}
        payload={{ assignees: [...assigned], lockedFields: [...locked] }}
        submitLabel="Save assignments"
      >
        {() => (
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSet className="gap-2">
              <FieldLegend variant="label">Assigned members</FieldLegend>
              {members.map((m) => (
                <Field key={m.userId} orientation="horizontal">
                  <Checkbox
                    id={`assign-${m.userId}`}
                    checked={assigned.has(m.userId)}
                    onCheckedChange={(v) => setAssigned((s) => flip(s, m.userId, v === true))}
                  />
                  <FieldLabel htmlFor={`assign-${m.userId}`} className="font-normal">
                    {m.name}
                  </FieldLabel>
                </Field>
              ))}
            </FieldSet>
            <FieldSet className="gap-2">
              <FieldLegend variant="label">Locked fields</FieldLegend>
              {(Object.keys(LOCKABLE_LABELS) as LockableField[]).map((f) => (
                <Field key={f} orientation="horizontal">
                  <Checkbox
                    id={`lock-${f}`}
                    checked={locked.has(f)}
                    onCheckedChange={(v) => setLocked((s) => flip(s, f, v === true))}
                  />
                  <FieldLabel htmlFor={`lock-${f}`} className="font-normal">
                    {LOCKABLE_LABELS[f]}
                  </FieldLabel>
                </Field>
              ))}
            </FieldSet>
          </div>
        )}
      </PayloadForm>
    </section>
  );
}
