"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";
import { createWebhookAction, type WebhookActionState } from "../server/actions";
import { SecretNotice } from "./secret-notice";
import { TriggerCheckboxes } from "./trigger-checkboxes";

const initial: WebhookActionState = { status: "idle" };
const DEFAULT_TRIGGERS = ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED"];

export type CreateWebhookFormProps = {
  /** Omit for team scope: team webhooks cover all of the team's event types (API-001). */
  eventTypes?: readonly { id: string; title: string }[];
  allowPrivate: boolean;
  /** Defaults to the personal action; team scope passes its team-bound one. */
  action?: (prev: WebhookActionState, formData: FormData) => Promise<WebhookActionState>;
};

export function CreateWebhookForm({ eventTypes, allowPrivate, action: override }: CreateWebhookFormProps) {
  const [state, action, pending] = useActionState<WebhookActionState, FormData>(override ?? createWebhookAction, initial);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field
        label="Endpoint URL"
        htmlFor="webhook-url"
        error={errors.url}
        hint={allowPrivate ? "http:// and private network addresses are allowed on this instance." : "Must be a public https:// address."}
      >
        <Input id="webhook-url" name="url" type="url" inputMode="url" placeholder="https://example.com/hooks/opencalendar" required maxLength={2048} aria-invalid={Boolean(errors.url)} />
      </Field>
      {eventTypes && (
        <Field label="Event types" htmlFor="webhook-event-type" error={errors.eventTypeId}>
          <Select id="webhook-event-type" name="eventTypeId" defaultValue="">
            <option value="">All my event types</option>
            {eventTypes.map((et) => (
              <option key={et.id} value={et.id}>
                {et.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <TriggerCheckboxes idPrefix={eventTypes ? "webhook-new" : "team-webhook-new"} selected={DEFAULT_TRIGGERS} error={errors.triggers} />
      {state.message && <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>}
      {state.secret && <SecretNotice secret={state.secret} />}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Creating…" : "Create webhook"}
      </Button>
    </form>
  );
}
