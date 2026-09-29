"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import type { RoutingCondition, RoutingField, RoutingOperator, RoutingRule } from "@/db/schema/routing";
import { MAX_CONDITIONS, MAX_RULES, OPERATOR_LABELS, operatorsFor } from "../schemas";
import type { EventTypeOption } from "../server/service";
import { ActionPicker } from "./action-picker";

type Errors = Partial<Record<string, string>>;
type Props = { rules: RoutingRule[]; fields: RoutingField[]; eventTypes: EventTypeOption[]; onChange: (next: RoutingRule[]) => void; errors: Errors };

function ValueInput({ id, condition, field, onChange, error }: { id: string; condition: RoutingCondition; field: RoutingField | undefined; onChange: (value: string[]) => void; error?: string }) {
  const { operator, value } = condition;
  if (operator === "between") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Field label="From" htmlFor={`${id}-lo`} error={error}>
          <Input id={`${id}-lo`} type="number" step="any" value={value[0] ?? ""} onChange={(e) => onChange([e.target.value, value[1] ?? ""])} />
        </Field>
        <Field label="To" htmlFor={`${id}-hi`}>
          <Input id={`${id}-hi`} type="number" step="any" value={value[1] ?? ""} onChange={(e) => onChange([value[0] ?? "", e.target.value])} />
        </Field>
      </div>
    );
  }
  if (operator === "in") {
    return (
      <Field label="Values (one per line)" htmlFor={id} error={error}>
        <textarea id={id} className="min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" value={value.join("\n")} onChange={(e) => onChange(e.target.value.split("\n").map((v) => v.trimStart()).slice(0, 50))} />
      </Field>
    );
  }
  if ((operator === "equals" || operator === "not_equals") && field && field.options.length > 0) {
    return (
      <Field label="Value" htmlFor={id} error={error}>
        <Select id={id} value={value[0] ?? ""} onChange={(e) => onChange([e.target.value])}>
          <option value="">Choose…</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  const numeric = operator === "gt" || operator === "lt" || field?.type === "number";
  return (
    <Field label="Value" htmlFor={id} error={error}>
      <Input id={id} type={numeric ? "number" : "text"} step={numeric ? "any" : undefined} maxLength={200} value={value[0] ?? ""} onChange={(e) => onChange([e.target.value])} />
    </Field>
  );
}

function ConditionRow({ id, condition, fields, onChange, onRemove, errors, errorPath }: { id: string; condition: RoutingCondition; fields: RoutingField[]; onChange: (next: RoutingCondition) => void; onRemove: () => void; errors: Errors; errorPath: string }) {
  const field = fields.find((f) => f.key === condition.field);
  const operators = field ? operatorsFor(field.type) : [];
  const pickField = (key: string) => {
    const next = fields.find((f) => f.key === key);
    const allowed = next ? operatorsFor(next.type) : [];
    const operator: RoutingOperator = allowed.includes(condition.operator) ? condition.operator : (allowed[0] ?? "equals");
    onChange({ field: key, operator, value: operator === condition.operator ? condition.value : [] });
  };
  return (
    <div className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
      <Field label="Question" htmlFor={`${id}-field`} error={errors[`${errorPath}.field`]}>
        <Select id={`${id}-field`} value={condition.field} onChange={(e) => pickField(e.target.value)}>
          <option value="">Choose…</option>
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label || f.key}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Condition" htmlFor={`${id}-op`}>
        <Select id={`${id}-op`} value={condition.operator} onChange={(e) => onChange({ ...condition, operator: e.target.value as RoutingOperator, value: [] })}>
          {(operators.length > 0 ? operators : [condition.operator]).map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </option>
          ))}
        </Select>
      </Field>
      <ValueInput id={`${id}-value`} condition={condition} field={field} onChange={(value) => onChange({ ...condition, value })} error={errors[`${errorPath}.value`]} />
      <Button type="button" variant="ghost" className="mt-6 h-10 w-10 px-0" aria-label="Remove condition" onClick={onRemove}>
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

/** Ordered routing rules with AND/OR conditions (RTE-002). The first matching rule wins. */
export function RulesEditor({ rules, fields, eventTypes, onChange, errors }: Props) {
  const update = (i: number, patch: Partial<RoutingRule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const addRule = () =>
    onChange([
      ...rules,
      { id: crypto.randomUUID(), match: "all", conditions: [{ field: fields[0]?.key ?? "", operator: "equals", value: [] }], action: { kind: "event_type", eventTypeId: eventTypes[0]?.id ?? "" } },
    ]);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="rules-heading">
      <h2 id="rules-heading" className="font-medium">
        Routing rules
      </h2>
      <p className="text-sm text-muted">Rules are checked from top to bottom; the first one that matches decides where the visitor goes.</p>
      <ol className="flex flex-col gap-3">
        {rules.map((rule, i) => (
          <li key={rule.id} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Rule {i + 1}</h3>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" className="h-8 w-8 px-0" aria-label={`Move rule ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button type="button" variant="ghost" className="h-8 w-8 px-0" aria-label={`Move rule ${i + 1} down`} disabled={i === rules.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button type="button" variant="ghost" className="h-8 w-8 px-0" aria-label={`Remove rule ${i + 1}`} onClick={() => onChange(rules.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
            {errors[`rules.${i}.conditions`] && <p className="text-sm text-danger">{errors[`rules.${i}.conditions`]}</p>}
            <Field label="When" htmlFor={`rule-${i}-match`}>
              <Select id={`rule-${i}-match`} value={rule.match} onChange={(e) => update(i, { match: e.target.value as RoutingRule["match"] })} className="w-full sm:w-72">
                <option value="all">All of these match (AND)</option>
                <option value="any">Any of these matches (OR)</option>
              </Select>
            </Field>
            <div className="flex flex-col gap-3">
              {rule.conditions.map((c, j) => (
                <ConditionRow
                  key={j}
                  id={`rule-${i}-c${j}`}
                  condition={c}
                  fields={fields}
                  errors={errors}
                  errorPath={`rules.${i}.conditions.${j}`}
                  onChange={(next) => update(i, { conditions: rule.conditions.map((x, k) => (k === j ? next : x)) })}
                  onRemove={() => update(i, { conditions: rule.conditions.filter((_, k) => k !== j) })}
                />
              ))}
            </div>
            {rule.conditions.length < MAX_CONDITIONS && (
              <Button type="button" variant="secondary" className="self-start" onClick={() => update(i, { conditions: [...rule.conditions, { field: fields[0]?.key ?? "", operator: "equals", value: [] }] })}>
                Add condition
              </Button>
            )}
            <ActionPicker idPrefix={`rule-${i}-action`} label="Then route to" action={rule.action} eventTypes={eventTypes} errors={errors} errorPath={`rules.${i}.action`} onChange={(action) => update(i, { action })} />
          </li>
        ))}
      </ol>
      {rules.length < MAX_RULES && (
        <Button type="button" variant="secondary" className="self-start" onClick={addRule}>
          Add rule
        </Button>
      )}
    </section>
  );
}
