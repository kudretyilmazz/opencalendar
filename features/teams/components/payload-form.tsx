"use client";

import { type ReactNode, useActionState } from "react";
import { Alert, Button } from "@/components/ui/primitives";
import { type ActionState, idle } from "@/lib/actions";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  payload: unknown;
  submitLabel: string;
  children?: (errors: Partial<Record<string, string>>) => ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  /** Screen-reader name when the visible label is ambiguous (e.g. many "Remove" buttons). */
  submitAriaLabel?: string;
};

/** A form that posts its state as the JSON `payload` field (see `parsePayload`), with feedback. */
export function PayloadForm({ action, payload, submitLabel, children, variant = "primary", className, submitAriaLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, idle);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className={className ?? "flex flex-col gap-3"}>
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {children?.(errors)}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={variant} disabled={pending} aria-label={submitAriaLabel}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {state.message && <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>}
      </div>
    </form>
  );
}
