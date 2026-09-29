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
      <p className="text-sm text-muted-foreground">
        Name and email are always asked. Answers can be prefilled with URL parameters named after the identifier (e.g. <code>?company=ACME</code>).
      </p>
      {errors.questions && (
        <Alert variant="destructive">
          <AlertDescription>{errors.questions}</AlertDescription>
        </Alert>
      )}
      <ol className="flex flex-col gap-3">
        {questions.map((q, i) => (
          <li key={i} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{QUESTION_LABELS[q.type]}</span>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label={`Move "${q.label || "question"}" up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Move "${q.label || "question"}" down`} disabled={i === questions.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove "${q.label || "question"}"`} onClick={() => onChange(questions.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Question" htmlFor={`q-label-${i}`} error={errors[`questions.${i}.label`]}>
                <Input id={`q-label-${i}`} value={q.label} maxLength={200} onChange={(e) => update(i, { label: e.target.value })} />
              </FormField>
              <FormField label="Identifier" htmlFor={`q-key-${i}`} error={errors[`questions.${i}.key`]} hint="Used for URL prefill and webhooks.">
                <Input id={`q-key-${i}`} value={q.key} maxLength={40} onChange={(e) => update(i, { key: e.target.value.toLowerCase() })} />
              </FormField>
              {QUESTION_HAS_OPTIONS.has(q.type) ? (
                <div className="sm:col-span-2">
                  <FormField label="Options (one per line)" htmlFor={`q-options-${i}`} error={errors[`questions.${i}.options`]}>
                    <Textarea
                      id={`q-options-${i}`}
                      className="min-h-20"
                      value={q.options.join("\n")}
                      onChange={(e) => update(i, { options: e.target.value.split("\n").map((o) => o.trimStart()).slice(0, 30) })}
                    />
                  </FormField>
                </div>
              ) : (
                q.type !== "boolean" && (
                  <FormField label="Placeholder (optional)" htmlFor={`q-placeholder-${i}`}>
                    <Input id={`q-placeholder-${i}`} value={q.placeholder ?? ""} maxLength={200} onChange={(e) => update(i, { placeholder: e.target.value || null })} />
                  </FormField>
                )
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              <Field orientation="horizontal" className="w-auto" data-disabled={q.hidden || undefined}>
                <Checkbox id={`q-required-${i}`} checked={q.required} disabled={q.hidden} onCheckedChange={(v) => update(i, { required: v === true })} />
                <FieldLabel htmlFor={`q-required-${i}`} className="font-normal">
                  Required
                </FieldLabel>
              </Field>
              <Field orientation="horizontal" className="w-auto">
                <Checkbox
                  id={`q-hidden-${i}`}
                  checked={q.hidden}
                  onCheckedChange={(v) => update(i, { hidden: v === true, required: v === true ? false : q.required })}
                />
                <FieldLabel htmlFor={`q-hidden-${i}`} className="font-normal">
                  Hidden (prefill only)
                </FieldLabel>
              </Field>
            </div>
            {errors[`questions.${i}.required`] && <p className="text-sm text-destructive">{errors[`questions.${i}.required`]}</p>}
          </li>
        ))}
      </ol>
      {questions.length < 30 && (
        <div className="flex items-end gap-2">
          <FormField label="Add a question" htmlFor="newQuestionType">
            <Select value={newType} onValueChange={(value) => setNewType(value as QuestionType)}>
              <SelectTrigger id="newQuestionType" className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {QUESTION_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <Button
            type="button"
            variant="outline"
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
