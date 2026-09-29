"use client";

import { useActionState, useEffect, useState } from "react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { RoutingField } from "@/db/schema/routing";
import { idle } from "@/lib/actions";
import { emitEmbed, watchDimensions } from "@/lib/embed/bridge";
import { safeRedirectPath } from "@/lib/security/redirect";
import type { SubmitState } from "../server/actions";

type Answers = Record<string, string | string[]>;
type Props = {
  formId: string;
  name: string;
  description: string | null;
  fields: RoutingField[];
  prefill: Answers;
  embed: boolean;
  submit: (prev: SubmitState, formData: FormData) => Promise<SubmitState>;
};

/** Radix SelectItem values must be non-empty; this stands for "no answer". */
const NONE = "__none";

const EMBED_PARAMS = ["embed", "theme", "brand", "hideDetails", "layout"];

/** Keeps the embed look when the next page is one of ours (same-origin path). */
function withEmbedParams(path: string): string {
  const here = new URLSearchParams(window.location.search);
  const url = new URL(path, window.location.origin);
  for (const key of EMBED_PARAMS) {
    const value = here.get(key);
    if (value !== null) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function navigate(url: string, embed: boolean): void {
  if (url.startsWith("/")) {
    const safe = safeRedirectPath(url, "/");
    window.location.assign(embed ? withEmbedParams(safe) : safe);
  } else if (/^https:\/\//i.test(url)) {
    window.location.assign(url);
  }
}

export function RoutingMessage({ message }: { message: string }) {
  return (
    <Alert variant="success">
      <AlertDescription className="text-base whitespace-pre-line text-current">{message}</AlertDescription>
    </Alert>
  );
}

/** Public routing form (RTE-001, RTE-006): submits, then follows the resolved target. */
export function PublicRoutingForm({ formId, name, description, fields, prefill, embed, submit }: Props) {
  const [answers, setAnswers] = useState<Answers>(prefill);
  const [state, action, pending] = useActionState(submit, idle as SubmitState);
  const errors = state.fieldErrors ?? {};
  const set = (key: string, value: string | string[]) => setAnswers((a) => ({ ...a, [key]: value }));
  const target = state.status === "success" ? state.target : undefined;

  // RTE-006 / EMB-005: a framed form announces itself and lets the host auto-resize the iframe.
  useEffect(() => {
    if (!embed) return;
    emitEmbed("ready", {});
    return watchDimensions();
  }, [embed]);

  useEffect(() => {
    if (target?.kind === "redirect") navigate(target.url, embed);
  }, [target, embed]);

  if (target?.kind === "message") return <RoutingMessage message={target.message} />;
  if (target?.kind === "redirect") return <p role="status" className="text-sm text-muted-foreground">Redirecting…</p>;

  return (
    <form action={action} className="flex flex-col gap-4" data-form-id={formId}>
      <input type="hidden" name="payload" value={JSON.stringify({ answers })} />
      {!embed && <h1 className="text-2xl font-semibold">{name}</h1>}
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {state.status === "error" && state.message && !state.fieldErrors && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {fields.map((f) => {
        const id = `rf-${f.key}`;
        const error = errors[f.key];
        const value = answers[f.key];
        if (f.type === "radio" || f.type === "multi_select") {
          const selected = Array.isArray(value) ? value : value ? [value] : [];
          return (
            <FieldSet key={f.key} className="gap-1.5" aria-describedby={error ? `${id}-error` : undefined}>
              <FieldLegend variant="label" className="mb-1">
                {f.label}
                {f.required && <span aria-hidden> *</span>}
              </FieldLegend>
              {f.type === "radio" ? (
                <RadioGroup name={id} value={selected[0] ?? ""} required={f.required} onValueChange={(o) => set(f.key, o)}>
                  {f.options.map((o, i) => (
                    <Field key={o} orientation="horizontal">
                      <RadioGroupItem id={`${id}-${i}`} value={o} />
                      <FieldLabel htmlFor={`${id}-${i}`} className="font-normal">
                        {o}
                      </FieldLabel>
                    </Field>
                  ))}
                </RadioGroup>
              ) : (
                f.options.map((o, i) => (
                  <Field key={o} orientation="horizontal">
                    <Checkbox
                      id={`${id}-${i}`}
                      name={id}
                      value={o}
                      checked={selected.includes(o)}
                      onCheckedChange={(checked) => set(f.key, checked === true ? [...selected, o] : selected.filter((s) => s !== o))}
                    />
                    <FieldLabel htmlFor={`${id}-${i}`} className="font-normal">
                      {o}
                    </FieldLabel>
                  </Field>
                ))
              )}
              {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
            </FieldSet>
          );
        }
        const text = typeof value === "string" ? value : "";
        return (
          <FormField key={f.key} label={f.required ? `${f.label} *` : f.label} htmlFor={id} error={error}>
            {f.type === "select" ? (
              <Select value={text} required={f.required} onValueChange={(v) => set(f.key, v === NONE ? "" : v)}>
                <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}>
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {!f.required && <SelectItem value={NONE}>Choose…</SelectItem>}
                  {f.options.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={id}
                type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "number" ? "number" : "text"}
                step={f.type === "number" ? "any" : undefined}
                value={text}
                required={f.required}
                maxLength={500}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
          </FormField>
        );
      })}
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Sending…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
