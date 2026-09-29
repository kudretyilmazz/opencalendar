"use client";

import { useActionState, useState } from "react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { type ActionState, idle } from "@/lib/actions";
import { CALDAV_PRESETS } from "@/lib/integrations/caldav-presets";
import { connectCaldavAction, connectIcsAction } from "../server/actions";

export type PresetKey = keyof typeof CALDAV_PRESETS;

/** Called after a successful connect with the action's message (e.g. to close a dialog). */
type OnConnected = (message: string) => void;

/** Wraps a connect action so `onConnected` runs, inside the same transition, once it succeeds. */
function notifying(
  run: (prev: ActionState, formData: FormData) => Promise<ActionState>,
  onConnected?: OnConnected,
): (prev: ActionState, formData: FormData) => Promise<ActionState> {
  return async (prev, formData) => {
    const result = await run(prev, formData);
    if (result.status === "success") onConnected?.(result.message ?? "Connected.");
    return result;
  };
}

const FIELD_CLASS = "h-10 rounded-md";

function StatusAlert({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <Alert variant={state.status === "success" ? "success" : "destructive"}>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

export function CaldavForm({ initialPreset = "icloud", onConnected }: { initialPreset?: PresetKey; onConnected?: OnConnected }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(notifying(connectCaldavAction, onConnected), idle);
  const [preset, setPreset] = useState<PresetKey>(initialPreset);
  const [serverUrl, setServerUrl] = useState<string>(CALDAV_PRESETS[initialPreset].serverUrl);
  const errors = state.fieldErrors ?? {};
  return (
    <div className="flex flex-col gap-3">
      {/* Outside the <form>: the preset is not submitted, and a Radix Select inside it would snap
          back to its first value when React resets the form after the action. */}
      <FormField label="Provider" htmlFor="caldav-preset">
        <Select
          value={preset}
          onValueChange={(value) => {
            const next = value as PresetKey;
            setPreset(next);
            setServerUrl(CALDAV_PRESETS[next].serverUrl);
          }}
        >
          <SelectTrigger id="caldav-preset" className="w-full rounded-md data-[size=default]:h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CALDAV_PRESETS).map(([key, p]) => (
              <SelectItem key={key} value={key}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <p className="text-xs text-muted-foreground">{CALDAV_PRESETS[preset].help}</p>
      <form action={action} className="flex flex-col gap-3">
        <FormField label="Server URL" htmlFor="caldav-url" error={errors.serverUrl}>
          <Input id="caldav-url" name="serverUrl" type="url" required value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} className={FIELD_CLASS} />
        </FormField>
        <FormField label="Username" htmlFor="caldav-username" error={errors.username}>
          <Input id="caldav-username" name="username" autoComplete="username" required className={FIELD_CLASS} />
        </FormField>
        <FormField label="Password" htmlFor="caldav-password" error={errors.password} hint="Use an app-specific password where your provider offers one.">
          <Input id="caldav-password" name="password" type="password" autoComplete="current-password" required className={FIELD_CLASS} />
        </FormField>
        <StatusAlert state={state} />
        <Button type="submit" disabled={pending} className="h-10 self-start rounded-md px-4">
          {pending && <Spinner />}
          {pending ? "Connecting…" : "Connect CalDAV"}
        </Button>
      </form>
    </div>
  );
}

export function IcsFeedForm({ onConnected }: { onConnected?: OnConnected }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(notifying(connectIcsAction, onConnected), idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormField label="Calendar feed URL (.ics)" htmlFor="ics-url" error={state.fieldErrors?.url} hint="Read-only: its events block your availability, nothing is written back.">
        <Input id="ics-url" name="url" type="text" inputMode="url" placeholder="https://… or webcal://…" required className={FIELD_CLASS} />
      </FormField>
      <StatusAlert state={state} />
      <Button type="submit" disabled={pending} className="h-10 self-start rounded-md px-4">
        {pending && <Spinner />}
        {pending ? "Adding…" : "Add feed"}
      </Button>
    </form>
  );
}
