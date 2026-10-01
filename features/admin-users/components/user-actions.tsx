"use client";

import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { type ActionState, idle } from "@/lib/actions";
import { cn } from "@/lib/cn";
import { deleteUserAction, setUserDisabledAction, setUserRoleAction } from "../server/actions";

type Target = { id: string; name: string; email: string; role: "user" | "admin"; disabled: boolean };

const SMALL = "h-8 rounded-md px-2.5 text-[13px]";

function ActionButton({ action, fields, label, tone }: { action: (prev: ActionState, f: FormData) => Promise<ActionState>; fields: Record<string, string>; label: string; tone?: "danger" }) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(action, idle);
  return (
    <form action={dispatch} className="flex flex-col items-end gap-1">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" variant="outline" disabled={pending} className={cn(SMALL, tone === "danger" && "text-destructive")}>
        {pending && <Spinner />}
        {label}
      </Button>
      {state.status === "error" && (
        <span role="alert" className="max-w-56 text-right text-xs text-destructive">
          {state.message}
        </span>
      )}
    </form>
  );
}

function DeleteUser({ target }: { target: Target }) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(deleteUserAction, idle);
  const inputId = `confirm-${target.id}`;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" className={cn(SMALL, "text-destructive")}>
          Delete…
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {target.name}&rsquo;s account?</AlertDialogTitle>
          <AlertDialogDescription>
            Their upcoming bookings are cancelled (invitees are notified), and their account, schedules, event types and bookings are
            deleted permanently. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={dispatch} className="flex flex-col gap-4">
          <input type="hidden" name="userId" value={target.id} />
          <FormField label={`Type ${target.email} to confirm`} htmlFor={inputId} error={state.fieldErrors?.confirm}>
            <Input id={inputId} name="confirm" autoComplete="off" className="h-10 rounded-md" />
          </FormField>
          {state.status === "error" && !state.fieldErrors && (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 rounded-md">Cancel</AlertDialogCancel>
            <Button type="submit" disabled={pending} className="h-10 rounded-md bg-destructive-soft px-3.5 text-destructive hover:bg-destructive-soft/80">
              {pending && <Spinner />}
              {pending ? "Deleting…" : "Delete account"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Row actions for one account. The server re-checks every rule (self, last admin). */
export function UserActions({ target, isSelf }: { target: Target; isSelf: boolean }) {
  if (isSelf) return <span className="text-xs text-muted-foreground">You</span>;
  return (
    <div className="flex flex-wrap items-start justify-end gap-1.5">
      <ActionButton
        action={setUserRoleAction}
        fields={{ userId: target.id, role: target.role === "admin" ? "user" : "admin" }}
        label={target.role === "admin" ? "Remove admin" : "Make admin"}
      />
      <ActionButton
        action={setUserDisabledAction}
        fields={{ userId: target.id, disabled: String(!target.disabled) }}
        label={target.disabled ? "Enable" : "Disable"}
        tone={target.disabled ? undefined : "danger"}
      />
      <DeleteUser target={target} />
    </div>
  );
}
