"use client";

import { Ellipsis } from "lucide-react";
import { useActionState, useOptimistic, useRef, useState, useTransition } from "react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { WebhookActionState } from "../server/actions";
import { SecretNotice } from "./secret-notice";
import { TriggerCheckboxes } from "./trigger-checkboxes";

const initial: WebhookActionState = { status: "idle" };

function Message({ state }: { state: WebhookActionState }) {
  if (!state.message) return null;
  return (
    <Alert variant={state.status === "success" ? "success" : "destructive"}>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

/** A server action already bound to one webhook (personal or team scope). */
export type BoundAction = (prev: WebhookActionState) => Promise<WebhookActionState>;
export type BoundFormAction = (prev: WebhookActionState, formData: FormData) => Promise<WebhookActionState>;

/** Pauses or resumes deliveries at once (the card's switch). */
export function ActiveSwitch({ url, active, action }: { url: string; active: boolean; action: (active: boolean) => Promise<void> }) {
  const [optimistic, setOptimistic] = useOptimistic(active);
  const [pending, startTransition] = useTransition();
  return (
    // 44px touch target around the 36×20 switch.
    <label className="-m-3 flex min-h-11 shrink-0 cursor-pointer items-center p-3">
      <Switch
        checked={optimistic}
        disabled={pending}
        aria-label={`Send to ${url}`}
        onCheckedChange={(next) =>
          startTransition(async () => {
            setOptimistic(next);
            await action(next);
          })
        }
      />
    </label>
  );
}

export function TriggerEditor({ webhookId, triggers, action }: { webhookId: string; triggers: readonly string[]; action: BoundFormAction }) {
  const [state, formAction, pending] = useActionState<WebhookActionState, FormData>(action, initial);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <TriggerCheckboxes idPrefix={`webhook-${webhookId}`} selected={triggers} />
      <Message state={state} />
      <Button type="submit" className="h-11 self-start rounded-md px-3.5 md:h-9" disabled={pending}>
        {pending && <Spinner />}
        {pending ? "Saving…" : "Save triggers"}
      </Button>
    </form>
  );
}

/** The card's "…" menu: edit the triggers (dialog) or delete the webhook (confirmation). */
export function WebhookMenu({
  webhookId,
  url,
  triggers,
  updateTriggers,
  remove,
}: {
  webhookId: string;
  url: string;
  triggers: readonly string[];
  updateTriggers: BoundFormAction;
  remove: () => Promise<void>;
}) {
  const [dialog, setDialog] = useState<"triggers" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };
  return (
    <>
      {/* Non-modal: the menu hands focus over to the dialog it opens. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-11 shrink-0 rounded-md text-muted-foreground md:size-9" aria-label={`More actions for ${url}`}>
            {pending ? <Spinner /> : <Ellipsis aria-hidden />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("triggers")}>Edit triggers…</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            Delete webhook…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={dialog === "triggers"} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Triggers</DialogTitle>
            <DialogDescription className="break-all">Events sent to {url}</DialogDescription>
          </DialogHeader>
          <TriggerEditor webhookId={webhookId} triggers={triggers} action={updateTriggers} />
        </DialogContent>
      </Dialog>
      <AlertDialog open={dialog === "delete"} onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this webhook?</AlertDialogTitle>
            <AlertDialogDescription className="break-all">
              {url} stops receiving events and its delivery log is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => startTransition(() => remove())} aria-label={`Delete webhook ${url}`}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * The signing secret row: masked secret, scope, "Roll secret…" (asks first: the old secret stops
 * working at once) and a test ping. Results show under the row; a new secret is shown once.
 */
export function SecretRow({ url, scopeLabel, roll, ping }: { url: string; scopeLabel: string; roll: BoundAction; ping: BoundAction }) {
  const [rollState, rollAction, rolling] = useActionState<WebhookActionState>(roll, initial);
  const [pingState, pingAction, pinging] = useActionState<WebhookActionState>(ping, initial);
  const rollForm = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  const small = "h-11 rounded-md px-3 text-[13px] md:h-8";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 rounded-md bg-background px-3 py-2.5 text-[13px] md:flex-row md:items-center md:gap-4 md:pl-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-muted-foreground">Signing secret</span>
          <span className="font-mono text-xs">
            <span aria-hidden>whsec_••••••••••••</span>
            <span className="sr-only">hidden</span>
          </span>
          <span className="text-muted-foreground">{scopeLabel}</span>
        </div>
        <div className="flex flex-wrap gap-2 md:ml-auto">
          <form ref={rollForm} action={rollAction}>
            <Button
              type="button"
              variant="ghost"
              className={`${small} text-muted-foreground`}
              disabled={rolling}
              aria-label={`Roll the signing secret of ${url}`}
              onClick={() => setConfirming(true)}
            >
              {rolling && <Spinner />}
              {rolling ? "Rolling…" : "Roll secret…"}
            </Button>
          </form>
          <form action={pingAction}>
            <Button type="submit" variant="outline" className={`${small} bg-card`} disabled={pinging} aria-label={`Send a test event to ${url}`}>
              {pinging && <Spinner />}
              {pinging ? "Sending…" : "Send test event"}
            </Button>
          </form>
        </div>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create a new signing secret?</AlertDialogTitle>
            <AlertDialogDescription>The current secret stops working immediately.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => rollForm.current?.requestSubmit()}>
              Roll secret
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Message state={rollState} />
      {rollState.secret && <SecretNotice secret={rollState.secret} />}
      <Message state={pingState} />
    </div>
  );
}
