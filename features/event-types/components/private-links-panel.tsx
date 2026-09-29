"use client";

import { useActionState, useTransition } from "react";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";
import { type ActionState, idle } from "@/lib/actions";
import { createPrivateLinkAction, deletePrivateLinkAction } from "../server/extras-actions";

export type PrivateLinkItem = { id: string; url: string; status: "active" | "used" | "expired"; expires: string | null };

const STATUS_LABEL = { active: "Unused", used: "Used", expired: "Expired" } as const;

/** Single-use links for this event type (EVT-015). */
export function PrivateLinksPanel({ eventTypeId, links, linkOnly }: { eventTypeId: string; links: PrivateLinkItem[]; linkOnly: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createPrivateLinkAction.bind(null, eventTypeId), idle);
  const [deleting, startDelete] = useTransition();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Single-use links</h2>
      <p className="text-sm text-muted">
        Each link can book this event once.{" "}
        {linkOnly ? "This event type can only be booked with such a link." : "Turn on “Only bookable with a single-use link” above to require one."}
      </p>
      {links.length > 0 && (
        <ul className="flex flex-col gap-2">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
              <code className="min-w-0 flex-1 break-all text-xs">{l.url}</code>
              <span className="text-muted">
                {STATUS_LABEL[l.status]}
                {l.expires && l.status === "active" ? ` · expires ${l.expires}` : ""}
              </span>
              {l.status === "active" && (
                <Button type="button" variant="secondary" className="h-8" onClick={() => void navigator.clipboard.writeText(l.url)}>
                  Copy
                </Button>
              )}
              <Button type="button" variant="ghost" className="h-8" disabled={deleting} onClick={() => startDelete(() => deletePrivateLinkAction(eventTypeId, l.id))}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex flex-wrap items-end gap-2">
        <Field label="Expires on (optional)" htmlFor="link-expires">
          <Input id="link-expires" name="expiresAt" type="date" className="w-48" />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          Create link
        </Button>
      </form>
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}
    </section>
  );
}
