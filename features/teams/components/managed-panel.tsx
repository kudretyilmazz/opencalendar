"use client";

import { useState } from "react";
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
      <p className="text-sm text-muted">
        Each assigned member gets their own copy at their own URL. Locked fields always follow this template; members can change the rest.
      </p>
      <PayloadForm action={action} payload={{ assignees: [...assigned], lockedFields: [...locked] }} submitLabel="Save assignments">
        {() => (
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="flex flex-col gap-2 text-sm">
              <legend className="mb-1 font-medium">Assigned members</legend>
              {members.map((m) => (
                <label key={m.userId} className="flex items-center gap-2">
                  <input type="checkbox" checked={assigned.has(m.userId)} onChange={(e) => setAssigned((s) => flip(s, m.userId, e.target.checked))} />
                  {m.name}
                </label>
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-2 text-sm">
              <legend className="mb-1 font-medium">Locked fields</legend>
              {(Object.keys(LOCKABLE_LABELS) as LockableField[]).map((f) => (
                <label key={f} className="flex items-center gap-2">
                  <input type="checkbox" checked={locked.has(f)} onChange={(e) => setLocked((s) => flip(s, f, e.target.checked))} />
                  {LOCKABLE_LABELS[f]}
                </label>
              ))}
            </fieldset>
          </div>
        )}
      </PayloadForm>
    </section>
  );
}
