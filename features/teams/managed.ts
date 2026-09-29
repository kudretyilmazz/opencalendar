import { type EventTypeForm, eventTypeFormSchema } from "@/features/event-types/schemas";
import { eventTypeToForm } from "@/features/event-types/form-input";
import type { EventTypeView } from "@/features/event-types/server/service";
import { LOCKABLE_FIELDS, type LockableField } from "./schemas";

/**
 * Managed event types (TEAM-008), pure part: which form keys a template locks, and how a member's
 * input is overridden by them. The slug is always locked so every copy keeps the template's URL.
 */

const isLockable = (f: string): f is LockableField => f in LOCKABLE_FIELDS;

export function lockedKeys(lockedFields: readonly string[]): Set<keyof EventTypeForm> {
  const keys = lockedFields.filter(isLockable).flatMap((f) => LOCKABLE_FIELDS[f]);
  return new Set<keyof EventTypeForm>(["slug", ...keys]);
}

/** The template as normalized form values (what a member's copy starts from). */
export function templateForm(template: EventTypeView): EventTypeForm {
  return eventTypeFormSchema.parse({ ...eventTypeToForm(template), scheduleId: null });
}

/** `input` with every locked key taken from the template. */
export function applyLocks(template: EventTypeView, input: EventTypeForm): EventTypeForm {
  const source = templateForm(template);
  const locked = [...lockedKeys(template.lockedFields)];
  return { ...input, ...Object.fromEntries(locked.map((k) => [k, source[k]])) } as EventTypeForm;
}

/** Only the locked values, for pushing a template change to every copy. */
export function lockedValues(template: EventTypeView): Partial<EventTypeForm> {
  const source = templateForm(template);
  return Object.fromEntries([...lockedKeys(template.lockedFields)].map((k) => [k, source[k]])) as Partial<EventTypeForm>;
}
