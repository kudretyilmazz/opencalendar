"use client";

import { type ComponentProps, type ReactNode, useActionState, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type ActionState, idle } from "@/lib/actions";
import { submitWithoutReset } from "@/lib/submit-without-reset";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  payload: unknown;
  submitLabel: string;
  children?: (errors: Partial<Record<string, string>>) => ReactNode;
  variant?: ComponentProps<typeof Button>["variant"];
  className?: string;
  /** Screen-reader name when the visible label is ambiguous (e.g. many "Remove" buttons). */
  submitAriaLabel?: string;
  /** Ask first (destructive actions): the submit button opens this dialog, which submits on confirm. */
  confirm?: { title: string; description: string; action: string };
};

/** A form that posts its state as the JSON `payload` field (see `parsePayload`), with feedback. */
export function PayloadForm({
  action,
  payload,
  submitLabel,
  children,
  variant = "default",
  className,
  submitAriaLabel,
  confirm,
}: Props) {
  const [state, formAction, pending] = useActionState(action, idle);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state.fieldErrors ?? {};
  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={submitWithoutReset(formAction)}
      className={className ?? "flex flex-col gap-3"}
    >
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {children?.(errors)}
      <div className="flex flex-wrap items-center gap-3">
        {confirm ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant={variant} disabled={pending} aria-label={submitAriaLabel}>
                {pending && <Spinner />}
                {pending ? "Saving…" : submitLabel}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
                <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => formRef.current?.requestSubmit()}>
                  {confirm.action}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button type="submit" variant={variant} disabled={pending} aria-label={submitAriaLabel}>
            {pending && <Spinner />}
            {pending ? "Saving…" : submitLabel}
          </Button>
        )}
        {state.message && (
          <Alert variant={state.status === "error" ? "destructive" : "success"} className="w-auto">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
      </div>
    </form>
  );
}
