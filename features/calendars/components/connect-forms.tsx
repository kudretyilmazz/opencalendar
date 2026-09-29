"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";
import { type ActionState, idle } from "@/lib/actions";
import { CALDAV_PRESETS } from "@/lib/integrations/caldav-presets";
import { connectCaldavAction, connectIcsAction } from "../server/actions";

type PresetKey = keyof typeof CALDAV_PRESETS;

export function CaldavForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(connectCaldavAction, idle);
  const [preset, setPreset] = useState<PresetKey>("icloud");
  const [serverUrl, setServerUrl] = useState<string>(CALDAV_PRESETS.icloud.serverUrl);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Provider" htmlFor="caldav-preset">
        <Select
          id="caldav-preset"
          value={preset}
          onChange={(e) => {
            const next = e.target.value as PresetKey;
            setPreset(next);
            setServerUrl(CALDAV_PRESETS[next].serverUrl);
          }}
        >
          {Object.entries(CALDAV_PRESETS).map(([key, p]) => (
            <option key={key} value={key}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-xs text-muted">{CALDAV_PRESETS[preset].help}</p>
      <Field label="Server URL" htmlFor="caldav-url" error={errors.serverUrl}>
        <Input id="caldav-url" name="serverUrl" type="url" required value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
      </Field>
      <Field label="Username" htmlFor="caldav-username" error={errors.username}>
        <Input id="caldav-username" name="username" autoComplete="username" required />
      </Field>
      <Field label="Password" htmlFor="caldav-password" error={errors.password} hint="Use an app-specific password where your provider offers one.">
        <Input id="caldav-password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.message && <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Connecting…" : "Connect CalDAV"}
      </Button>
    </form>
  );
}

export function IcsFeedForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(connectIcsAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Calendar feed URL (.ics)" htmlFor="ics-url" error={state.fieldErrors?.url} hint="Read-only: its events block your availability, nothing is written back.">
        <Input id="ics-url" name="url" type="text" inputMode="url" placeholder="https://… or webcal://…" required />
      </Field>
      {state.message && <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>}
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Adding…" : "Add feed"}
      </Button>
    </form>
  );
}
