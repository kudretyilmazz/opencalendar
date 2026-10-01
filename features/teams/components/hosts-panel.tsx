"use client";

import { useState } from "react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ActionState } from "@/lib/actions";
import { PRIORITY_LABELS } from "@/lib/availability/round-robin";
import type { HostForm } from "../schemas";
import { PayloadForm } from "./payload-form";

type Member = { userId: string; name: string };

/**
 * Hosts of a collective or round-robin event type (TEAM-004…007). Round robin shows the fixed
 * toggle, weight and priority; collective hosts always attend.
 */
export function HostsPanel({
  members,
  initial,
  initialAssignAll,
  windowDays,
  roundRobin,
  action,
}: {
  members: Member[];
  initial: HostForm[];
  /** "Assign all team members" is on: everyone hosts, including people who join later. */
  initialAssignAll: boolean;
  windowDays: number;
  roundRobin: boolean;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [picked, setHosts] = useState<HostForm[]>(initial);
  const [assignAll, setAssignAll] = useState(initialAssignAll);
  const [rrWindow, setRrWindow] = useState(windowDays);
  const pickedById = new Map(picked.map((h) => [h.userId, h]));
  // With assign-all every member hosts; settings already chosen for someone are kept.
  const hosts = assignAll
    ? members.map((m) => pickedById.get(m.userId) ?? { userId: m.userId, isFixed: !roundRobin, weight: 100, priority: 2 })
    : picked;
  const byId = new Map(hosts.map((h) => [h.userId, h]));
  const toggle = (userId: string, on: boolean) =>
    setHosts((list) =>
      on
        ? [...list, { userId, isFixed: !roundRobin, weight: 100, priority: 2 }]
        : list.filter((h) => h.userId !== userId),
    );
  const patch = (userId: string, change: Partial<HostForm>) =>
    setHosts(() => hosts.map((h) => (h.userId === userId ? { ...h, ...change } : h)));
  const switchAssignAll = (on: boolean) => {
    // Turning it off keeps today's members as hosts, so nothing changes until boxes are unticked.
    setHosts(hosts);
    setAssignAll(on);
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Hosts</h2>
      <p className="text-sm text-muted-foreground">
        {roundRobin
          ? "Each booking goes to one free host, balanced by weight over recent bookings; priority breaks ties. Fixed hosts attend every booking."
          : "Every host attends; a time is offered only when all of them are free."}
      </p>
      {hosts.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            No hosts yet, so the booking page shows no times. Pick hosts below, or assign all team members, and save.
          </AlertDescription>
        </Alert>
      )}
      <PayloadForm action={action} payload={{ hosts, roundRobinWindowDays: rrWindow, assignAll }} submitLabel="Save hosts">
        {(errors) => (
          <>
            <div className="flex items-start gap-3 rounded-md border border-border p-3">
              <Switch id="assign-all" checked={assignAll} onCheckedChange={switchAssignAll} aria-describedby="assign-all-hint" />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="assign-all">Assign all team members</Label>
                <span id="assign-all-hint" className="text-[13px] text-muted-foreground">
                  {roundRobin
                    ? "Everyone in the team is in the pool, including people who join later."
                    : "Everyone in the team hosts, including people who join later. A time is offered only when all of them are free, so it gets harder to find one as the team grows."}
                </span>
              </div>
            </div>
            <ul className="flex flex-col gap-2">
              {members.map((m) => {
                const host = byId.get(m.userId);
                return (
                  <li
                    key={m.userId}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-border p-2 text-sm"
                  >
                    <Field orientation="horizontal" className="w-auto min-w-40 flex-1">
                      <Checkbox
                        id={`host-${m.userId}`}
                        checked={Boolean(host)}
                        disabled={assignAll}
                        onCheckedChange={(v) => toggle(m.userId, v === true)}
                      />
                      <FieldLabel htmlFor={`host-${m.userId}`} className="font-normal">
                        {m.name}
                      </FieldLabel>
                    </Field>
                    {host && roundRobin && (
                      <>
                        <Field orientation="horizontal" className="w-auto">
                          <Checkbox
                            id={`host-fixed-${m.userId}`}
                            checked={host.isFixed}
                            onCheckedChange={(v) => patch(m.userId, { isFixed: v === true })}
                          />
                          <FieldLabel htmlFor={`host-fixed-${m.userId}`} className="font-normal">
                            Fixed
                          </FieldLabel>
                        </Field>
                        <Label className="font-normal">
                          Weight
                          <Input
                            type="number"
                            min={1}
                            max={1000}
                            className="w-20"
                            value={host.weight}
                            aria-label={`Weight for ${m.name}`}
                            onChange={(e) => patch(m.userId, { weight: Number(e.target.value) || 1 })}
                          />
                        </Label>
                        <div className="flex items-center gap-2">
                          <span>Priority</span>
                          <Select
                            value={String(host.priority)}
                            onValueChange={(v) => patch(m.userId, { priority: Number(v) })}
                          >
                            <SelectTrigger className="w-28" aria-label={`Priority for ${m.name}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PRIORITY_LABELS.map((label, value) => (
                                <SelectItem key={label} value={String(value)}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            {errors.hosts && <p className="text-xs text-destructive">{errors.hosts}</p>}
            {roundRobin && (
              <FormField label="Balance over the last (days)" htmlFor="rr-window" error={errors.roundRobinWindowDays}>
                <Input
                  id="rr-window"
                  type="number"
                  min={1}
                  max={365}
                  className="w-32"
                  value={rrWindow}
                  onChange={(e) => setRrWindow(Number(e.target.value) || 1)}
                />
              </FormField>
            )}
          </>
        )}
      </PayloadForm>
    </section>
  );
}
