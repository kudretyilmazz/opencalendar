"use client";

import { useActionState, useTransition } from "react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Spinner } from "@/components/ui/spinner";
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
      <p className="text-sm text-muted-foreground">
        Each link can book this event once.{" "}
        {linkOnly ? "This event type can only be booked with such a link." : "Turn on “Only bookable with a single-use link” above to require one."}
      </p>
      {links.length > 0 && (
        <ul className="flex flex-col gap-2">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
              <code className="min-w-0 flex-1 break-all text-xs">{l.url}</code>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Badge variant={l.status === "active" ? "secondary" : "outline"}>{STATUS_LABEL[l.status]}</Badge>
                {l.expires && l.status === "active" ? `expires ${l.expires}` : ""}
              </span>
              {l.status === "active" && (
                <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(l.url)}>
                  Copy
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" disabled={deleting} onClick={() => startDelete(() => deletePrivateLinkAction(eventTypeId, l.id))}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex flex-wrap items-end gap-2">
        <FormField label="Expires on (optional)" htmlFor="link-expires" className="w-56">
          {/* Remounts once a link is added, clearing the date like the form reset cleared the native input. */}
          <DatePicker key={links.length} id="link-expires" name="expiresAt" clearable />
        </FormField>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending && <Spinner />}
          Create link
        </Button>
      </form>
      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
