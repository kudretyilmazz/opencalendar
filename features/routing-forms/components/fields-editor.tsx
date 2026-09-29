"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RoutingField, RoutingFieldType } from "@/db/schema/routing";
import { FIELD_HAS_OPTIONS, FIELD_LABELS, FIELD_TYPES, MAX_FIELDS } from "../schemas";

type Props = {
  fields: RoutingField[];
  onChange: (next: RoutingField[]) => void;
  errors: Partial<Record<string, string>>;
};

const keyFrom = (label: string, taken: Set<string>): string => {
  const base =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[^a-z]+/, "")
      .slice(0, 30) || "field";
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  return key;
};

/** Routing-form field builder (RTE-001). The identifier is also the URL parameter for prefill and headless routing. */
export function FieldsEditor({ fields, onChange, errors }: Props) {
  const [newType, setNewType] = useState<RoutingFieldType>("text");
  const update = (i: number, patch: Partial<RoutingField>) =>
    onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="fields-heading">
      <h2 id="fields-heading" className="font-medium">
        Questions
      </h2>
      <p className="text-sm text-muted-foreground">
        What visitors are asked. Answers can be prefilled with URL parameters named after the identifier (e.g.{" "}
        <code>?company=ACME</code>). Answers whose identifier matches a booking question of the target event type
        prefill the booking form.
      </p>
      {errors.fields && (
        <Alert variant="destructive">
          <AlertDescription>{errors.fields}</AlertDescription>
        </Alert>
      )}
      <ol className="flex flex-col gap-3">
        {fields.map((f, i) => (
          <li key={i} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{FIELD_LABELS[f.type]}</span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move "${f.label || "question"}" up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move "${f.label || "question"}" down`}
                  disabled={i === fields.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove "${f.label || "question"}"`}
                  onClick={() => onChange(fields.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Question" htmlFor={`f-label-${i}`} error={errors[`fields.${i}.label`]}>
                <Input
                  id={`f-label-${i}`}
                  value={f.label}
                  maxLength={200}
                  onChange={(e) => update(i, { label: e.target.value })}
                />
              </FormField>
              <FormField
                label="Identifier"
                htmlFor={`f-key-${i}`}
                error={errors[`fields.${i}.key`]}
                hint="Lowercase letters, digits and underscores."
              >
                <Input
                  id={`f-key-${i}`}
                  value={f.key}
                  maxLength={40}
                  onChange={(e) => update(i, { key: e.target.value.toLowerCase() })}
                />
              </FormField>
              {FIELD_HAS_OPTIONS.has(f.type) && (
                <FormField
                  label="Options (one per line)"
                  htmlFor={`f-options-${i}`}
                  error={errors[`fields.${i}.options`]}
                  className="sm:col-span-2"
                >
                  <Textarea
                    id={`f-options-${i}`}
                    className="min-h-20"
                    value={f.options.join("\n")}
                    onChange={(e) =>
                      update(i, {
                        options: e.target.value
                          .split("\n")
                          .map((o) => o.trimStart())
                          .slice(0, 50),
                      })
                    }
                  />
                </FormField>
              )}
            </div>
            <Field orientation="horizontal">
              <Checkbox
                id={`f-required-${i}`}
                checked={f.required}
                onCheckedChange={(v) => update(i, { required: v === true })}
              />
              <FieldLabel htmlFor={`f-required-${i}`} className="font-normal">
                Required
              </FieldLabel>
            </Field>
          </li>
        ))}
      </ol>
      {fields.length < MAX_FIELDS && (
        <div className="flex items-end gap-2">
          <FormField label="Add a question" htmlFor="newFieldType" className="w-auto">
            <Select value={newType} onValueChange={(v) => setNewType(v as RoutingFieldType)}>
              <SelectTrigger id="newFieldType" className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {FIELD_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange([
                ...fields,
                {
                  key: keyFrom(FIELD_LABELS[newType].split(" (")[0], new Set(fields.map((f) => f.key))),
                  label: "",
                  type: newType,
                  required: false,
                  options: [],
                },
              ])
            }
          >
            Add question
          </Button>
        </div>
      )}
    </section>
  );
}
