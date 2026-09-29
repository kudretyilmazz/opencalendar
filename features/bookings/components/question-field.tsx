"use client";

import { FormField } from "@/components/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Question } from "@/features/event-types/schemas";
import type { Answer } from "../responses";

type Props = { question: Question; value: Answer | undefined; error?: string; onChange: (value: Answer | undefined) => void };

/** Radix SelectItem values must be non-empty; this stands for "no answer". */
const NONE = "__none";

/** One booking question (EVT-009), rendered by type with an accessible label. */
export function QuestionField({ question: q, value, error, onChange }: Props) {
  const id = `q-${q.key}`;
  const label = `${q.label}${q.required ? "" : " (optional)"}`;
  const str = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const list = Array.isArray(value) ? value : [];

  if (q.type === "boolean") {
    return (
      <Field data-invalid={error ? true : undefined} className="gap-1">
        <Field orientation="horizontal" className="items-start">
          <Checkbox
            id={id}
            className="mt-0.5"
            checked={value === true}
            required={q.required}
            aria-invalid={error ? true : undefined}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          <FieldLabel htmlFor={id} className="font-normal">
            {label}
          </FieldLabel>
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </Field>
    );
  }

  if (q.type === "radio") {
    return (
      <FieldSet className="gap-1.5" aria-describedby={error ? `${id}-error` : undefined}>
        <FieldLegend variant="label" className="mb-1">
          {label}
        </FieldLegend>
        <RadioGroup name={id} value={str} onValueChange={(option) => onChange(option)}>
          {q.options.map((option, i) => (
            <Field key={option} orientation="horizontal">
              <RadioGroupItem id={`${id}-${i}`} value={option} />
              <FieldLabel htmlFor={`${id}-${i}`} className="font-normal">
                {option}
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
        {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      </FieldSet>
    );
  }

  // Multi-select questions share the checkbox list: both answer with the chosen options.
  if (q.type === "checkbox" || q.type === "multi_select") {
    return (
      <FieldSet className="gap-1.5" aria-describedby={error ? `${id}-error` : undefined}>
        <FieldLegend variant="label" className="mb-1">
          {label}
        </FieldLegend>
        {q.options.map((option, i) => (
          <Field key={option} orientation="horizontal">
            <Checkbox
              id={`${id}-${i}`}
              checked={list.includes(option)}
              onCheckedChange={(checked) => onChange(checked === true ? [...list, option] : list.filter((o) => o !== option))}
            />
            <FieldLabel htmlFor={`${id}-${i}`} className="font-normal">
              {option}
            </FieldLabel>
          </Field>
        ))}
        {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      </FieldSet>
    );
  }

  const describedBy = error ? `${id}-error` : undefined;

  return (
    <FormField label={label} htmlFor={id} error={error}>
      {q.type === "long_text" ? (
        <Textarea
          id={id}
          className="min-h-20"
          maxLength={5000}
          required={q.required}
          placeholder={q.placeholder ?? undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          value={str}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : q.type === "select" ? (
        <Select required={q.required} value={str} onValueChange={(v) => onChange(v === NONE ? undefined : v)}>
          <SelectTrigger id={id} className="w-full" aria-invalid={error ? true : undefined} aria-describedby={describedBy}>
            <SelectValue placeholder={q.placeholder ?? "Choose…"} />
          </SelectTrigger>
          <SelectContent>
            {!q.required && <SelectItem value={NONE}>{q.placeholder ?? "Choose…"}</SelectItem>}
            {q.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          type={q.type === "number" ? "number" : q.type === "email" ? "email" : q.type === "phone" ? "tel" : q.type === "url" ? "url" : "text"}
          required={q.required}
          placeholder={q.placeholder ?? undefined}
          maxLength={q.type === "short_text" ? 500 : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          value={str}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </FormField>
  );
}
