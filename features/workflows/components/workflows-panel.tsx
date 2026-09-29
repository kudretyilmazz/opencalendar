"use client";

import { useActionState, useState, useTransition } from "react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteWorkflowAction,
  saveWorkflowAction,
  toggleWorkflowAction,
} from "@/features/event-types/server/extras-actions";
import { deleteTeamWorkflowAction, saveTeamWorkflowAction, toggleTeamWorkflowAction } from "../server/team-actions";
import { type ActionState, idle } from "@/lib/actions";
import { submitWithoutReset } from "@/lib/submit-without-reset";
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

function WorkflowEditor({
  scope,
  initial,
  id,
  onDone,
}: {
  scope: WorkflowScope;
  initial: WorkflowFormInput;
  id: string | null;
  onDone: () => void;
}) {
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
    <form
      action={action}
      onSubmit={submitWithoutReset(action)}
      className="flex flex-col gap-3 rounded-md border border-border p-3"
    >
      <input type="hidden" name="payload" value={JSON.stringify(form)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Name" htmlFor={`wf-name-${prefix}`} error={errors.name}>
          <Input
            id={`wf-name-${prefix}`}
            value={form.name}
            maxLength={100}
            onChange={(e) => set({ name: e.target.value })}
          />
        </FormField>
        <FormField label="When" htmlFor={`wf-trigger-${prefix}`}>
          <Select value={form.trigger} onValueChange={(v) => set({ trigger: v as WorkflowFormInput["trigger"] })}>
            <SelectTrigger id={`wf-trigger-${prefix}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKFLOW_TRIGGERS.map((t) => (
                <SelectItem key={t} value={t}>
                  {TRIGGER_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {isTimed(form.trigger) && (
          <FormField
            label={form.trigger === "before_start" ? "Minutes before" : "Minutes after"}
            htmlFor={`wf-offset-${prefix}`}
            error={errors.offsetMinutes}
          >
            <Input
              id={`wf-offset-${prefix}`}
              type="number"
              min={1}
              max={43200}
              value={form.offsetMinutes}
              onChange={(e) => set({ offsetMinutes: Number(e.target.value) })}
            />
          </FormField>
        )}
        <FormField label="Send to" htmlFor={`wf-recipient-${prefix}`}>
          <Select value={form.recipient} onValueChange={(v) => set({ recipient: v as WorkflowFormInput["recipient"] })}>
            <SelectTrigger id={`wf-recipient-${prefix}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKFLOW_RECIPIENTS.map((r) => (
                <SelectItem key={r} value={r}>
                  {RECIPIENT_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {form.recipient === "address" && (
          <FormField label="Email address" htmlFor={`wf-address-${prefix}`} error={errors.address}>
            <Input
              id={`wf-address-${prefix}`}
              type="email"
              value={form.address ?? ""}
              onChange={(e) => set({ address: e.target.value || null })}
            />
          </FormField>
        )}
      </div>
      <FormField label="Subject" htmlFor={`wf-subject-${prefix}`} error={errors.subject}>
        <Input
          id={`wf-subject-${prefix}`}
          value={form.subject}
          maxLength={200}
          onChange={(e) => set({ subject: e.target.value })}
        />
      </FormField>
      <FormField
        label="Message"
        htmlFor={`wf-body-${prefix}`}
        hint={`Variables: ${TEMPLATE_VARIABLES.join(" ")}`}
        error={errors.body}
      >
        <Textarea
          id={`wf-body-${prefix}`}
          className="min-h-32"
          maxLength={5000}
          value={form.body}
          onChange={(e) => set({ body: e.target.value })}
        />
      </FormField>
      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          Save workflow
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
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
      <p className="text-sm text-muted-foreground">
        Automatic emails for {scope.kind === "team" ? "every event type of this team" : "this event type"}, such as
        reminders. Times are shown in each recipient’s time zone.
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
                <p className="text-muted-foreground">{describe(w)}</p>
              </div>
              <Field orientation="horizontal" className="w-auto">
                <Switch
                  id={`wf-on-${w.id}`}
                  checked={w.enabled}
                  disabled={busy}
                  onCheckedChange={(on) => startTransition(() => actions.toggle(scope.id, w.id, on))}
                />
                <FieldLabel htmlFor={`wf-on-${w.id}`} className="font-normal">
                  On
                </FieldLabel>
              </Field>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(w.id)}>
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => startTransition(() => actions.remove(scope.id, w.id))}
              >
                Delete
              </Button>
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <WorkflowEditor
          scope={scope}
          id={null}
          initial={{ ...DEFAULT_REMINDER, name: "New workflow" }}
          onDone={() => setEditing(null)}
        />
      ) : (
        <Button type="button" variant="outline" className="self-start" onClick={() => setEditing("new")}>
          Add workflow
        </Button>
      )}
    </section>
  );
}
