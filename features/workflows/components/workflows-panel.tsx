"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";
import { deleteWorkflowAction, saveWorkflowAction, toggleWorkflowAction } from "@/features/event-types/server/extras-actions";
import { deleteTeamWorkflowAction, saveTeamWorkflowAction, toggleTeamWorkflowAction } from "../server/team-actions";
import { type ActionState, idle } from "@/lib/actions";
import {
  DEFAULT_REMINDER,
  isTimed,
  RECIPIENT_LABELS,
  TEMPLATE_VARIABLES,
  TRIGGER_LABELS,
  WORKFLOW_RECIPIENTS,
  WORKFLOW_TRIGGERS,
  type WorkflowFormInput,
} from "../schemas";

export type WorkflowItem = WorkflowFormInput & { id: string; isDefault: boolean };

/** Whose workflows: one event type's (NTF-005) or a whole team's (NTF-007). */
export type WorkflowScope = { kind: "event_type"; id: string } | { kind: "team"; id: string };

const actionsFor = (scope: WorkflowScope) =>
  scope.kind === "team"
    ? { save: saveTeamWorkflowAction, toggle: toggleTeamWorkflowAction, remove: deleteTeamWorkflowAction }
    : { save: saveWorkflowAction, toggle: toggleWorkflowAction, remove: deleteWorkflowAction };

function describe(w: WorkflowItem): string {
  const when = isTimed(w.trigger)
    ? `${w.offsetMinutes >= 60 && w.offsetMinutes % 60 === 0 ? `${w.offsetMinutes / 60} h` : `${w.offsetMinutes} min`} ${w.trigger === "before_start" ? "before the start" : "after the end"}`
    : TRIGGER_LABELS[w.trigger].toLowerCase();
  return `Email ${RECIPIENT_LABELS[w.recipient].toLowerCase()} ${when}`;
}

function WorkflowEditor({ scope, initial, id, onDone }: { scope: WorkflowScope; initial: WorkflowFormInput; id: string | null; onDone: () => void }) {
  const [form, setForm] = useState(initial);
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, data) => {
    const result = await actionsFor(scope).save(scope.id, id, prev, data);
    if (result.status === "success") onDone();
    return result;
  }, idle);
  const set = (patch: Partial<WorkflowFormInput>) => setForm((f) => ({ ...f, ...patch }));
  const errors = state.fieldErrors ?? {};
  const prefix = id ?? "new";

  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <input type="hidden" name="payload" value={JSON.stringify(form)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor={`wf-name-${prefix}`} error={errors.name}>
          <Input id={`wf-name-${prefix}`} value={form.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="When" htmlFor={`wf-trigger-${prefix}`}>
          <Select id={`wf-trigger-${prefix}`} value={form.trigger} onChange={(e) => set({ trigger: e.target.value as WorkflowFormInput["trigger"] })}>
            {WORKFLOW_TRIGGERS.map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        {isTimed(form.trigger) && (
          <Field label={form.trigger === "before_start" ? "Minutes before" : "Minutes after"} htmlFor={`wf-offset-${prefix}`} error={errors.offsetMinutes}>
            <Input id={`wf-offset-${prefix}`} type="number" min={1} max={43200} value={form.offsetMinutes} onChange={(e) => set({ offsetMinutes: Number(e.target.value) })} />
          </Field>
        )}
        <Field label="Send to" htmlFor={`wf-recipient-${prefix}`}>
          <Select id={`wf-recipient-${prefix}`} value={form.recipient} onChange={(e) => set({ recipient: e.target.value as WorkflowFormInput["recipient"] })}>
            {WORKFLOW_RECIPIENTS.map((r) => (
              <option key={r} value={r}>
                {RECIPIENT_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        {form.recipient === "address" && (
          <Field label="Email address" htmlFor={`wf-address-${prefix}`} error={errors.address}>
            <Input id={`wf-address-${prefix}`} type="email" value={form.address ?? ""} onChange={(e) => set({ address: e.target.value || null })} />
          </Field>
        )}
      </div>
      <Field label="Subject" htmlFor={`wf-subject-${prefix}`} error={errors.subject}>
        <Input id={`wf-subject-${prefix}`} value={form.subject} maxLength={200} onChange={(e) => set({ subject: e.target.value })} />
      </Field>
      <Field label="Message" htmlFor={`wf-body-${prefix}`} hint={`Variables: ${TEMPLATE_VARIABLES.join(" ")}`} error={errors.body}>
        <textarea id={`wf-body-${prefix}`} className="min-h-32 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" maxLength={5000} value={form.body} onChange={(e) => set({ body: e.target.value })} />
      </Field>
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" className="h-9" disabled={pending}>
          Save workflow
        </Button>
        <Button type="button" variant="ghost" className="h-9" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Email workflows of one event type (NTF-005/006) or of a team (NTF-007). */
export function WorkflowsPanel({ scope, workflows }: { scope: WorkflowScope; workflows: WorkflowItem[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, startTransition] = useTransition();
  const actions = actionsFor(scope);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Workflows</h2>
      <p className="text-sm text-muted">
        Automatic emails for {scope.kind === "team" ? "every event type of this team" : "this event type"}, such as reminders. Times are shown in each recipient’s time zone.
      </p>
      <ul className="flex flex-col gap-2">
        {workflows.map((w) =>
          editing === w.id ? (
            <li key={w.id}>
              <WorkflowEditor scope={scope} id={w.id} initial={w} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={w.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{w.name}</p>
                <p className="text-muted">{describe(w)}</p>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={w.enabled} disabled={busy} onChange={(e) => startTransition(() => actions.toggle(scope.id, w.id, e.target.checked))} />
                On
              </label>
              <Button type="button" variant="secondary" className="h-8" onClick={() => setEditing(w.id)}>
                Edit
              </Button>
              <Button type="button" variant="ghost" className="h-8" disabled={busy} onClick={() => startTransition(() => actions.remove(scope.id, w.id))}>
                Delete
              </Button>
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <WorkflowEditor scope={scope} id={null} initial={{ ...DEFAULT_REMINDER, name: "New workflow" }} onDone={() => setEditing(null)} />
      ) : (
        <Button type="button" variant="secondary" className="self-start" onClick={() => setEditing("new")}>
          Add workflow
        </Button>
      )}
    </section>
  );
}
