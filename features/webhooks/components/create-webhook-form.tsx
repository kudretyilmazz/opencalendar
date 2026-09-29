"use client";

import { useActionState, useState } from "react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { createWebhookAction, type WebhookActionState } from "../server/actions";
import { SecretNotice } from "./secret-notice";
import { TriggerCheckboxes } from "./trigger-checkboxes";

const initial: WebhookActionState = { status: "idle" };
const DEFAULT_TRIGGERS = ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED"];
/** Radix Select items can't have an empty value; "all event types" submits "" as before. */
const ALL_EVENT_TYPES = "__all";

export type CreateWebhookFormProps = {
  /** Omit for team scope: team webhooks cover all of the team's event types (API-001). */
  eventTypes?: readonly { id: string; title: string }[];
  allowPrivate: boolean;
  /** Defaults to the personal action; team scope passes its team-bound one. */
  action?: (prev: WebhookActionState, formData: FormData) => Promise<WebhookActionState>;
};

export function CreateWebhookForm({ eventTypes, allowPrivate, action: override }: CreateWebhookFormProps) {
  const [state, action, pending] = useActionState<WebhookActionState, FormData>(
    override ?? createWebhookAction,
    initial,
  );
  const [eventTypeId, setEventTypeId] = useState(ALL_EVENT_TYPES);
  // A successful create resets the form (React resets uncontrolled fields); do the same for the select.
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.status === "success") setEventTypeId(ALL_EVENT_TYPES);
  }
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormField
        label="Endpoint URL"
        htmlFor="webhook-url"
        error={errors.url}
        hint={
          allowPrivate
            ? "http:// and private network addresses are allowed on this instance."
            : "Must be a public https:// address."
        }
      >
        <Input
          id="webhook-url"
          name="url"
          type="url"
          inputMode="url"
          placeholder="https://example.com/hooks/opencalendar"
          required
          maxLength={2048}
          aria-invalid={Boolean(errors.url)}
        />
      </FormField>
      {eventTypes && (
        <FormField label="Event types" htmlFor="webhook-event-type" error={errors.eventTypeId}>
          <input type="hidden" name="eventTypeId" value={eventTypeId === ALL_EVENT_TYPES ? "" : eventTypeId} />
          <Select value={eventTypeId} onValueChange={setEventTypeId}>
            <SelectTrigger
              id="webhook-event-type"
              className="w-full"
              aria-invalid={errors.eventTypeId ? true : undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_EVENT_TYPES}>All my event types</SelectItem>
              {eventTypes.map((et) => (
                <SelectItem key={et.id} value={et.id}>
                  {et.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}
      <TriggerCheckboxes
        idPrefix={eventTypes ? "webhook-new" : "team-webhook-new"}
        selected={DEFAULT_TRIGGERS}
        error={errors.triggers}
      />
      {state.message && (
        <Alert variant={state.status === "success" ? "success" : "destructive"}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.secret && <SecretNotice secret={state.secret} />}
      <Button type="submit" disabled={pending} className="self-start">
        {pending && <Spinner />}
        {pending ? "Creating…" : "Create webhook"}
      </Button>
    </form>
  );
}
