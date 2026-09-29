"use client";

import { useState } from "react";
import { FormField } from "@/components/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  windowDays,
  roundRobin,
  action,
}: {
  members: Member[];
  initial: HostForm[];
  windowDays: number;
  roundRobin: boolean;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [hosts, setHosts] = useState<HostForm[]>(initial);
  const [rrWindow, setRrWindow] = useState(windowDays);
  const byId = new Map(hosts.map((h) => [h.userId, h]));
  const toggle = (userId: string, on: boolean) =>
    setHosts((list) =>
      on
        ? [...list, { userId, isFixed: !roundRobin, weight: 100, priority: 2 }]
        : list.filter((h) => h.userId !== userId),
    );
  const patch = (userId: string, change: Partial<HostForm>) =>
    setHosts((list) => list.map((h) => (h.userId === userId ? { ...h, ...change } : h)));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Hosts</h2>
      <p className="text-sm text-muted-foreground">
        {roundRobin
          ? "Each booking goes to one free host, balanced by weight over recent bookings; priority breaks ties. Fixed hosts attend every booking."
          : "Every host attends; a time is offered only when all of them are free."}
      </p>
      <PayloadForm action={action} payload={{ hosts, roundRobinWindowDays: rrWindow }} submitLabel="Save hosts">
        {(errors) => (
          <>
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
