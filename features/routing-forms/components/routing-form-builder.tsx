"use client";

import { useActionState, useMemo, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";
import type { RoutingAction } from "@/db/schema/routing";
import { type ActionState, idle } from "@/lib/actions";
import type { RoutingFormInput } from "../schemas";
import type { EventTypeOption } from "../server/service";
import { ActionPicker } from "./action-picker";
import { FieldsEditor } from "./fields-editor";
import { RulesEditor } from "./rules-editor";

export type OwnerOption = { key: string; label: string };
type Props = {
  initial: RoutingFormInput;
  /** New forms choose an owner ("personal" or a team id); existing forms keep theirs. */
  owners?: OwnerOption[];
  ownerKey: string;
  eventTypesByOwner: Record<string, EventTypeOption[]>;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
};

const nonBlank = (v: string) => v.trim() !== "";

/** Drops the blank lines the textareas keep while typing. */
const clean = (form: RoutingFormInput): RoutingFormInput => ({
  ...form,
  fields: form.fields.map((f) => ({ ...f, options: f.options.filter(nonBlank) })),
  rules: form.rules.map((r) => ({ ...r, conditions: r.conditions.map((c) => ({ ...c, value: c.value.filter(nonBlank) })) })),
});

const resetEventTypes = (action: RoutingAction): RoutingAction => (action.kind === "event_type" ? { kind: "event_type", eventTypeId: "" } : action);

/** Routing form builder (RTE-001…003): questions, ordered rules and the mandatory fallback. */
export function RoutingFormBuilder({ initial, owners, ownerKey: initialOwner, eventTypesByOwner, action }: Props) {
  const [form, setForm] = useState(initial);
  const [ownerKey, setOwnerKey] = useState(initialOwner);
  const [state, formAction, pending] = useActionState(action, idle);
  const eventTypes = useMemo(() => eventTypesByOwner[ownerKey] ?? [], [eventTypesByOwner, ownerKey]);
  // Server errors come back nested under `form.` on create.
  const errors = Object.fromEntries(Object.entries(state.fieldErrors ?? {}).map(([k, v]) => [k.replace(/^form\./, ""), v]));
  const set = (patch: Partial<RoutingFormInput>) => setForm((f) => ({ ...f, ...patch }));
  const payload = owners ? { teamId: ownerKey === "personal" ? null : ownerKey, form: clean(form) } : clean(form);

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {state.status === "error" && state.message && <Alert tone="error">{state.message}</Alert>}
      {state.status === "success" && state.message && <Alert tone="success">{state.message}</Alert>}

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="rf-name" error={errors.name}>
          <Input id="rf-name" value={form.name} required maxLength={100} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        {owners && (
          <Field label="Owner" htmlFor="rf-owner" hint="A team form is managed by the team's admins.">
            <Select
              id="rf-owner"
              value={ownerKey}
              onChange={(e) => {
                setOwnerKey(e.target.value);
                setForm((f) => ({ ...f, fallback: resetEventTypes(f.fallback), rules: f.rules.map((r) => ({ ...r, action: resetEventTypes(r.action) })) }));
              }}
            >
              {owners.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="sm:col-span-2">
          <Field label="Description (optional)" htmlFor="rf-description" error={errors.description}>
            <Input id="rf-description" value={form.description ?? ""} maxLength={500} onChange={(e) => set({ description: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!form.disabled} onChange={(e) => set({ disabled: !e.target.checked })} /> Accepting responses
        </label>
      </section>

      <FieldsEditor fields={form.fields} onChange={(fields) => set({ fields })} errors={errors} />
      <RulesEditor rules={form.rules} fields={form.fields} eventTypes={eventTypes} onChange={(rules) => set({ rules })} errors={errors} />

      <section className="flex flex-col gap-3" aria-labelledby="fallback-heading">
        <h2 id="fallback-heading" className="font-medium">
          Fallback
        </h2>
        <p className="text-sm text-muted">Where visitors go when no rule matches.</p>
        <ActionPicker idPrefix="fallback" label="Route to" action={form.fallback} eventTypes={eventTypes} errors={errors} errorPath="fallback" onChange={(fallback) => set({ fallback })} />
      </section>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save routing form"}
        </Button>
      </div>
    </form>
  );
}
