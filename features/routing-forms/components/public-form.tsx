"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";
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
    <Alert tone="success" className="whitespace-pre-line text-base">
      {message}
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
  if (target?.kind === "redirect") return <p role="status" className="text-sm text-muted">Redirecting…</p>;

  return (
    <form action={action} className="flex flex-col gap-4" data-form-id={formId}>
      <input type="hidden" name="payload" value={JSON.stringify({ answers })} />
      {!embed && <h1 className="text-2xl font-semibold">{name}</h1>}
      {description && <p className="text-sm text-muted">{description}</p>}
      {state.status === "error" && state.message && !state.fieldErrors && <Alert tone="error">{state.message}</Alert>}
      {fields.map((f) => {
        const id = `rf-${f.key}`;
        const error = errors[f.key];
        const value = answers[f.key];
        if (f.type === "radio" || f.type === "multi_select") {
          const selected = Array.isArray(value) ? value : value ? [value] : [];
          return (
            <fieldset key={f.key} className="flex flex-col gap-1.5" aria-describedby={error ? `${id}-error` : undefined}>
              <legend className="text-sm font-medium">
                {f.label}
                {f.required && <span aria-hidden> *</span>}
              </legend>
              {f.options.map((o, i) => (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <input
                    type={f.type === "radio" ? "radio" : "checkbox"}
                    name={id}
                    value={o}
                    id={`${id}-${i}`}
                    checked={selected.includes(o)}
                    required={f.type === "radio" && f.required}
                    onChange={(e) => set(f.key, f.type === "radio" ? o : e.target.checked ? [...selected, o] : selected.filter((s) => s !== o))}
                  />
                  {o}
                </label>
              ))}
              {error && (
                <p id={`${id}-error`} className="text-xs text-danger">
                  {error}
                </p>
              )}
            </fieldset>
          );
        }
        const text = typeof value === "string" ? value : "";
        return (
          <Field key={f.key} label={f.required ? `${f.label} *` : f.label} htmlFor={id} error={error}>
            {f.type === "select" ? (
              <Select id={id} value={text} required={f.required} aria-invalid={Boolean(error)} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">Choose…</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
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
          </Field>
        );
      })}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
