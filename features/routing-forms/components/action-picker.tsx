"use client";

import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

const KIND_LABELS: Record<RoutingAction["kind"], string> = {
  event_type: "An event type",
  external_url: "An external URL",
  message: "A custom message",
};

/** Radix Select items can't have an empty value; this stands in for "nothing chosen yet". */
const NONE = "__none";

const defaultFor = (kind: RoutingAction["kind"], eventTypes: EventTypeOption[]): RoutingAction =>
  kind === "event_type"
    ? { kind, eventTypeId: eventTypes[0]?.id ?? "" }
    : kind === "external_url"
      ? { kind, url: "https://" }
      : { kind, message: "" };

/** Where a rule (or the fallback) sends the visitor (RTE-002/003). */
export function ActionPicker({ idPrefix, label, action, eventTypes, onChange, errors, errorPath }: Props) {
  const eventError = errors[`${errorPath}.eventTypeId`];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label={label} htmlFor={`${idPrefix}-kind`}>
        <Select value={action.kind} onValueChange={(v) => onChange(defaultFor(v as RoutingAction["kind"], eventTypes))}>
          <SelectTrigger id={`${idPrefix}-kind`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABELS) as RoutingAction["kind"][]).map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      {action.kind === "event_type" && (
        <FormField label="Event type" htmlFor={`${idPrefix}-event`} error={eventError}>
          <Select
            value={action.eventTypeId || NONE}
            onValueChange={(v) => onChange({ kind: "event_type", eventTypeId: v === NONE ? "" : v })}
          >
            <SelectTrigger id={`${idPrefix}-event`} className="w-full" aria-invalid={eventError ? true : undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Choose…</SelectItem>
              {eventTypes.map((et) => (
                <SelectItem key={et.id} value={et.id}>
                  {et.title} (/{et.slug})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}
      {action.kind === "external_url" && (
        <FormField label="URL" htmlFor={`${idPrefix}-url`} error={errors[`${errorPath}.url`]}>
          <Input
            id={`${idPrefix}-url`}
            type="url"
            value={action.url}
            maxLength={2000}
            onChange={(e) => onChange({ kind: "external_url", url: e.target.value })}
          />
        </FormField>
      )}
      {action.kind === "message" && (
        <FormField
          label="Message"
          htmlFor={`${idPrefix}-message`}
          error={errors[`${errorPath}.message`]}
          className="sm:col-span-2"
        >
          <Textarea
            id={`${idPrefix}-message`}
            className="min-h-20"
            value={action.message}
            maxLength={1000}
            onChange={(e) => onChange({ kind: "message", message: e.target.value })}
          />
        </FormField>
      )}
    </div>
  );
}
