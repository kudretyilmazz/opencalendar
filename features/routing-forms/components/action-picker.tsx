"use client";

import { Field, Input, Select } from "@/components/ui/primitives";
import type { RoutingAction } from "@/db/schema/routing";
import type { EventTypeOption } from "../server/service";

type Props = {
  idPrefix: string;
  label: string;
  action: RoutingAction;
  eventTypes: EventTypeOption[];
  onChange: (next: RoutingAction) => void;
  errors: Partial<Record<string, string>>;
  /** Prefix of this action's error keys, e.g. "fallback" or "rules.0.action". */
  errorPath: string;
};

const KIND_LABELS: Record<RoutingAction["kind"], string> = { event_type: "An event type", external_url: "An external URL", message: "A custom message" };

const defaultFor = (kind: RoutingAction["kind"], eventTypes: EventTypeOption[]): RoutingAction =>
  kind === "event_type" ? { kind, eventTypeId: eventTypes[0]?.id ?? "" } : kind === "external_url" ? { kind, url: "https://" } : { kind, message: "" };

/** Where a rule (or the fallback) sends the visitor (RTE-002/003). */
export function ActionPicker({ idPrefix, label, action, eventTypes, onChange, errors, errorPath }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={label} htmlFor={`${idPrefix}-kind`}>
        <Select id={`${idPrefix}-kind`} value={action.kind} onChange={(e) => onChange(defaultFor(e.target.value as RoutingAction["kind"], eventTypes))}>
          {(Object.keys(KIND_LABELS) as RoutingAction["kind"][]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>
      {action.kind === "event_type" && (
        <Field label="Event type" htmlFor={`${idPrefix}-event`} error={errors[`${errorPath}.eventTypeId`]}>
          <Select id={`${idPrefix}-event`} value={action.eventTypeId} onChange={(e) => onChange({ kind: "event_type", eventTypeId: e.target.value })}>
            <option value="">Choose…</option>
            {eventTypes.map((et) => (
              <option key={et.id} value={et.id}>
                {et.title} (/{et.slug})
              </option>
            ))}
          </Select>
        </Field>
      )}
      {action.kind === "external_url" && (
        <Field label="URL" htmlFor={`${idPrefix}-url`} error={errors[`${errorPath}.url`]}>
          <Input id={`${idPrefix}-url`} type="url" value={action.url} maxLength={2000} onChange={(e) => onChange({ kind: "external_url", url: e.target.value })} />
        </Field>
      )}
      {action.kind === "message" && (
        <div className="sm:col-span-2">
          <Field label="Message" htmlFor={`${idPrefix}-message`} error={errors[`${errorPath}.message`]}>
            <textarea
              id={`${idPrefix}-message`}
              className="min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              value={action.message}
              maxLength={1000}
              onChange={(e) => onChange({ kind: "message", message: e.target.value })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
