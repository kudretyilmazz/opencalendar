"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";
import { type Question, QUESTION_HAS_OPTIONS, QUESTION_LABELS, QUESTION_TYPES, type QuestionType } from "../schemas";

type Props = { questions: Question[]; onChange: (next: Question[]) => void; errors: Partial<Record<string, string>> };

const keyFrom = (label: string, taken: Set<string>) => {
  const base =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[^a-z]+/, "")
      .slice(0, 30) || "question";
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  return key;
};

/** Booking questions builder (EVT-009). Name and email are always asked and not listed here. */
export function QuestionsEditor({ questions, onChange, errors }: Props) {
  const [newType, setNewType] = useState<QuestionType>("short_text");
  const update = (i: number, patch: Partial<Question>) => onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Booking questions</h2>
      <p className="text-sm text-muted">
        Name and email are always asked. Answers can be prefilled with URL parameters named after the identifier (e.g. <code>?company=ACME</code>).
      </p>
      {errors.questions && <Alert tone="error">{errors.questions}</Alert>}
      <ol className="flex flex-col gap-3">
        {questions.map((q, i) => (
          <li key={i} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{QUESTION_LABELS[q.type]}</span>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" className="h-8 w-8 px-0" aria-label={`Move "${q.label || "question"}" up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button type="button" variant="ghost" className="h-8 w-8 px-0" aria-label={`Move "${q.label || "question"}" down`} disabled={i === questions.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button type="button" variant="ghost" className="h-8 w-8 px-0" aria-label={`Remove "${q.label || "question"}"`} onClick={() => onChange(questions.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Question" htmlFor={`q-label-${i}`} error={errors[`questions.${i}.label`]}>
                <Input id={`q-label-${i}`} value={q.label} maxLength={200} onChange={(e) => update(i, { label: e.target.value })} />
              </Field>
              <Field label="Identifier" htmlFor={`q-key-${i}`} error={errors[`questions.${i}.key`]} hint="Used for URL prefill and webhooks.">
                <Input id={`q-key-${i}`} value={q.key} maxLength={40} onChange={(e) => update(i, { key: e.target.value.toLowerCase() })} />
              </Field>
              {QUESTION_HAS_OPTIONS.has(q.type) ? (
                <div className="sm:col-span-2">
                  <Field label="Options (one per line)" htmlFor={`q-options-${i}`} error={errors[`questions.${i}.options`]}>
                    <textarea
                      id={`q-options-${i}`}
                      className="min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                      value={q.options.join("\n")}
                      onChange={(e) => update(i, { options: e.target.value.split("\n").map((o) => o.trimStart()).slice(0, 30) })}
                    />
                  </Field>
                </div>
              ) : (
                q.type !== "boolean" && (
                  <Field label="Placeholder (optional)" htmlFor={`q-placeholder-${i}`}>
                    <Input id={`q-placeholder-${i}`} value={q.placeholder ?? ""} maxLength={200} onChange={(e) => update(i, { placeholder: e.target.value || null })} />
                  </Field>
                )
              )}
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={q.required} disabled={q.hidden} onChange={(e) => update(i, { required: e.target.checked })} /> Required
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={q.hidden} onChange={(e) => update(i, { hidden: e.target.checked, required: e.target.checked ? false : q.required })} /> Hidden (prefill only)
              </label>
            </div>
            {errors[`questions.${i}.required`] && <p className="text-sm text-danger">{errors[`questions.${i}.required`]}</p>}
          </li>
        ))}
      </ol>
      {questions.length < 30 && (
        <div className="flex items-end gap-2">
          <Field label="Add a question" htmlFor="newQuestionType">
            <Select id="newQuestionType" value={newType} onChange={(e) => setNewType(e.target.value as QuestionType)} className="w-64">
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {QUESTION_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const taken = new Set(questions.map((q) => q.key));
              onChange([...questions, { key: keyFrom(QUESTION_LABELS[newType], taken), type: newType, label: "", placeholder: null, required: false, hidden: false, options: [] }]);
            }}
          >
            Add question
          </Button>
        </div>
      )}
    </section>
  );
}
