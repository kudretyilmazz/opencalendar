"use client";

import { Field, Input, Select } from "@/components/ui/primitives";
import type { Question } from "@/features/event-types/schemas";
import type { Answer } from "../responses";

type Props = { question: Question; value: Answer | undefined; error?: string; onChange: (value: Answer | undefined) => void };

const textareaClass = "min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm";

/** One booking question (EVT-009), rendered by type with an accessible label. */
export function QuestionField({ question: q, value, error, onChange }: Props) {
  const id = `q-${q.key}`;
  const label = `${q.label}${q.required ? "" : " (optional)"}`;
  const str = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const list = Array.isArray(value) ? value : [];

  if (q.type === "boolean") {
    return (
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2 text-sm">
          <input id={id} type="checkbox" className="mt-0.5" checked={value === true} required={q.required} onChange={(e) => onChange(e.target.checked)} />
          <span>{label}</span>
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  if (q.type === "radio" || q.type === "checkbox") {
    const multi = q.type === "checkbox";
    return (
      <fieldset className="flex flex-col gap-1.5" aria-describedby={error ? `${id}-error` : undefined}>
        <legend className="mb-1 text-sm font-medium">{label}</legend>
        {q.options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type={multi ? "checkbox" : "radio"}
              name={id}
              checked={multi ? list.includes(option) : str === option}
              onChange={(e) => onChange(multi ? (e.target.checked ? [...list, option] : list.filter((o) => o !== option)) : option)}
            />
            {option}
          </label>
        ))}
        {error && (
          <p id={`${id}-error`} className="text-sm text-danger">
            {error}
          </p>
        )}
      </fieldset>
    );
  }

  return (
    <Field label={label} htmlFor={id} error={error}>
      {q.type === "long_text" ? (
        <textarea id={id} className={textareaClass} maxLength={5000} required={q.required} placeholder={q.placeholder ?? undefined} value={str} onChange={(e) => onChange(e.target.value)} />
      ) : q.type === "select" ? (
        <Select id={id} required={q.required} value={str} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">{q.placeholder ?? "Choose…"}</option>
          {q.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : q.type === "multi_select" ? (
        <Select id={id} multiple value={list} onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value))}>
          {q.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          id={id}
          type={q.type === "number" ? "number" : q.type === "email" ? "email" : q.type === "phone" ? "tel" : q.type === "url" ? "url" : "text"}
          required={q.required}
          placeholder={q.placeholder ?? undefined}
          maxLength={q.type === "short_text" ? 500 : undefined}
          value={str}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}
