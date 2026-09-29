"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/primitives";
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
    setHosts((list) => (on ? [...list, { userId, isFixed: !roundRobin, weight: 100, priority: 2 }] : list.filter((h) => h.userId !== userId)));
  const patch = (userId: string, change: Partial<HostForm>) => setHosts((list) => list.map((h) => (h.userId === userId ? { ...h, ...change } : h)));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Hosts</h2>
      <p className="text-sm text-muted">
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
                  <li key={m.userId} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-2 text-sm">
                    <label className="flex min-w-40 flex-1 items-center gap-2">
                      <input type="checkbox" checked={Boolean(host)} onChange={(e) => toggle(m.userId, e.target.checked)} />
                      {m.name}
                    </label>
                    {host && roundRobin && (
                      <>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={host.isFixed} onChange={(e) => patch(m.userId, { isFixed: e.target.checked })} />
                          Fixed
                        </label>
                        <label className="flex items-center gap-2">
                          Weight
                          <Input type="number" min={1} max={1000} className="h-8 w-20" value={host.weight} aria-label={`Weight for ${m.name}`} onChange={(e) => patch(m.userId, { weight: Number(e.target.value) || 1 })} />
                        </label>
                        <label className="flex items-center gap-2">
                          Priority
                          <Select className="h-8 w-28" value={host.priority} aria-label={`Priority for ${m.name}`} onChange={(e) => patch(m.userId, { priority: Number(e.target.value) })}>
                            {PRIORITY_LABELS.map((label, value) => (
                              <option key={label} value={value}>
                                {label}
                              </option>
                            ))}
                          </Select>
                        </label>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            {errors.hosts && <p className="text-xs text-danger">{errors.hosts}</p>}
            {roundRobin && (
              <Field label="Balance over the last (days)" htmlFor="rr-window" error={errors.roundRobinWindowDays}>
                <Input id="rr-window" type="number" min={1} max={365} className="w-32" value={rrWindow} onChange={(e) => setRrWindow(Number(e.target.value) || 1)} />
              </Field>
            )}
          </>
        )}
      </PayloadForm>
    </section>
  );
}
