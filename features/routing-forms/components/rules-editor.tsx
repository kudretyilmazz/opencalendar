"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RoutingCondition, RoutingField, RoutingOperator, RoutingRule } from "@/db/schema/routing";
import { MAX_CONDITIONS, MAX_RULES, OPERATOR_LABELS, operatorsFor } from "../schemas";
import type { EventTypeOption } from "../server/service";
import { ActionPicker } from "./action-picker";

type Errors = Partial<Record<string, string>>;
/** Radix Select items can't have an empty value; this stands in for "nothing chosen yet". */
const NONE = "__none";
const fromSelect = (v: string) => (v === NONE ? "" : v);

type Props = {
  rules: RoutingRule[];
  fields: RoutingField[];
  eventTypes: EventTypeOption[];
  onChange: (next: RoutingRule[]) => void;
  errors: Errors;
};

function ValueInput({
  id,
  condition,
  field,
  onChange,
  error,
}: {
  id: string;
  condition: RoutingCondition;
  field: RoutingField | undefined;
  onChange: (value: string[]) => void;
  error?: string;
}) {
  const { operator, value } = condition;
  if (operator === "between") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <FormField label="From" htmlFor={`${id}-lo`} error={error}>
          <Input
            id={`${id}-lo`}
            type="number"
            step="any"
            value={value[0] ?? ""}
            onChange={(e) => onChange([e.target.value, value[1] ?? ""])}
          />
        </FormField>
        <FormField label="To" htmlFor={`${id}-hi`}>
          <Input
            id={`${id}-hi`}
            type="number"
            step="any"
            value={value[1] ?? ""}
            onChange={(e) => onChange([value[0] ?? "", e.target.value])}
          />
        </FormField>
      </div>
    );
  }
  if (operator === "in") {
    return (
      <FormField label="Values (one per line)" htmlFor={id} error={error}>
        <Textarea
          id={id}
          className="min-h-20"
          value={value.join("\n")}
          onChange={(e) =>
            onChange(
              e.target.value
                .split("\n")
                .map((v) => v.trimStart())
                .slice(0, 50),
            )
          }
        />
      </FormField>
    );
  }
  if ((operator === "equals" || operator === "not_equals") && field && field.options.length > 0) {
    return (
      <FormField label="Value" htmlFor={id} error={error}>
        <Select value={value[0] || NONE} onValueChange={(v) => onChange([fromSelect(v)])}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Choose…</SelectItem>
            {field.options
              .filter((o) => o.trim() !== "")
              .map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </FormField>
    );
  }
  const numeric = operator === "gt" || operator === "lt" || field?.type === "number";
  return (
    <FormField label="Value" htmlFor={id} error={error}>
      <Input
        id={id}
        type={numeric ? "number" : "text"}
        step={numeric ? "any" : undefined}
        maxLength={200}
        value={value[0] ?? ""}
        onChange={(e) => onChange([e.target.value])}
      />
    </FormField>
  );
}

function ConditionRow({
  id,
  condition,
  fields,
  onChange,
  onRemove,
  errors,
  errorPath,
}: {
  id: string;
  condition: RoutingCondition;
  fields: RoutingField[];
  onChange: (next: RoutingCondition) => void;
  onRemove: () => void;
  errors: Errors;
  errorPath: string;
}) {
  const field = fields.find((f) => f.key === condition.field);
  const operators = field ? operatorsFor(field.type) : [];
  const pickField = (key: string) => {
    const next = fields.find((f) => f.key === key);
    const allowed = next ? operatorsFor(next.type) : [];
    const operator: RoutingOperator = allowed.includes(condition.operator)
      ? condition.operator
      : (allowed[0] ?? "equals");
    onChange({ field: key, operator, value: operator === condition.operator ? condition.value : [] });
  };
  return (
    <div className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
      <FormField label="Question" htmlFor={`${id}-field`} error={errors[`${errorPath}.field`]}>
        <Select value={condition.field || NONE} onValueChange={(v) => pickField(fromSelect(v))}>
          <SelectTrigger id={`${id}-field`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Choose…</SelectItem>
            {fields
              .filter((f) => f.key !== "")
              .map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.label || f.key}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="Condition" htmlFor={`${id}-op`}>
        <Select
          value={condition.operator}
          onValueChange={(v) => onChange({ ...condition, operator: v as RoutingOperator, value: [] })}
        >
          <SelectTrigger id={`${id}-op`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(operators.length > 0 ? operators : [condition.operator]).map((op) => (
              <SelectItem key={op} value={op}>
                {OPERATOR_LABELS[op]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <ValueInput
        id={`${id}-value`}
        condition={condition}
        field={field}
        onChange={(value) => onChange({ ...condition, value })}
        error={errors[`${errorPath}.value`]}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mt-6"
        aria-label="Remove condition"
        onClick={onRemove}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

/** Ordered routing rules with AND/OR conditions (RTE-002). The first matching rule wins. */
export function RulesEditor({ rules, fields, eventTypes, onChange, errors }: Props) {
  const update = (i: number, patch: Partial<RoutingRule>) =>
    onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
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
      {
        id: crypto.randomUUID(),
        match: "all",
        conditions: [{ field: fields[0]?.key ?? "", operator: "equals", value: [] }],
        action: { kind: "event_type", eventTypeId: eventTypes[0]?.id ?? "" },
      },
    ]);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="rules-heading">
      <h2 id="rules-heading" className="font-medium">
        Routing rules
      </h2>
      <p className="text-sm text-muted-foreground">
        Rules are checked from top to bottom; the first one that matches decides where the visitor goes.
      </p>
      <ol className="flex flex-col gap-3">
        {rules.map((rule, i) => (
          <li key={rule.id} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Rule {i + 1}</h3>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move rule ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move rule ${i + 1} down`}
                  disabled={i === rules.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove rule ${i + 1}`}
                  onClick={() => onChange(rules.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
            {errors[`rules.${i}.conditions`] && (
              <p className="text-sm text-destructive">{errors[`rules.${i}.conditions`]}</p>
            )}
            <FormField label="When" htmlFor={`rule-${i}-match`}>
              <Select value={rule.match} onValueChange={(v) => update(i, { match: v as RoutingRule["match"] })}>
                <SelectTrigger id={`rule-${i}-match`} className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All of these match (AND)</SelectItem>
                  <SelectItem value="any">Any of these matches (OR)</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
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
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() =>
                  update(i, {
                    conditions: [...rule.conditions, { field: fields[0]?.key ?? "", operator: "equals", value: [] }],
                  })
                }
              >
                Add condition
              </Button>
            )}
            <ActionPicker
              idPrefix={`rule-${i}-action`}
              label="Then route to"
              action={rule.action}
              eventTypes={eventTypes}
              errors={errors}
              errorPath={`rules.${i}.action`}
              onChange={(action) => update(i, { action })}
            />
          </li>
        ))}
      </ol>
      {rules.length < MAX_RULES && (
        <Button type="button" variant="outline" className="self-start" onClick={addRule}>
          Add rule
        </Button>
      )}
    </section>
  );
}
