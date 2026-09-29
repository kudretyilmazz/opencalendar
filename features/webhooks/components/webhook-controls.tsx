"use client";

import { useActionState } from "react";
import { Alert, Button } from "@/components/ui/primitives";
import { pingWebhookAction, rollSecretAction, updateTriggersAction, type WebhookActionState } from "../server/actions";
import { SecretNotice } from "./secret-notice";
import { TriggerCheckboxes } from "./trigger-checkboxes";

const initial: WebhookActionState = { status: "idle" };

function Message({ state }: { state: WebhookActionState }) {
  if (!state.message) return null;
  return <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>;
}

type Bound<Args extends unknown[] = []> = (...args: [...Args, WebhookActionState]) => Promise<WebhookActionState>;

/** `action` overrides the personal server action (team scope passes its team-bound one). */
export function PingButton({ webhookId, label, action: override }: { webhookId: string; label: string; action?: Bound }) {
  const [state, action, pending] = useActionState<WebhookActionState>(override ?? pingWebhookAction.bind(null, webhookId), initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <Button type="submit" variant="secondary" className="h-9 self-start" disabled={pending} aria-label={`Send a test ping to ${label}`}>
        {pending ? "Sending…" : "Send test ping"}
      </Button>
      <Message state={state} />
    </form>
  );
}

export function RollSecretButton({ webhookId, label, action: override }: { webhookId: string; label: string; action?: Bound }) {
  const [state, action, pending] = useActionState<WebhookActionState>(override ?? rollSecretAction.bind(null, webhookId), initial);
  return (
    <form
      action={action}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        if (!window.confirm("Create a new signing secret? The current secret stops working immediately.")) e.preventDefault();
      }}
    >
      <Button type="submit" variant="ghost" className="h-9 self-start" disabled={pending} aria-label={`Roll the signing secret of ${label}`}>
        {pending ? "Rolling…" : "Roll secret"}
      </Button>
      <Message state={state} />
      {state.secret && <SecretNotice secret={state.secret} />}
    </form>
  );
}

export function TriggerEditor({
  webhookId,
  triggers,
  action: override,
}: {
  webhookId: string;
  triggers: readonly string[];
  action?: (prev: WebhookActionState, formData: FormData) => Promise<WebhookActionState>;
}) {
  const [state, action, pending] = useActionState<WebhookActionState, FormData>(override ?? updateTriggersAction.bind(null, webhookId), initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <TriggerCheckboxes idPrefix={`webhook-${webhookId}`} selected={triggers} />
      <Message state={state} />
      <Button type="submit" variant="secondary" className="h-8 self-start" disabled={pending}>
        {pending ? "Saving…" : "Save triggers"}
      </Button>
    </form>
  );
}
