"use client";

import { useState, useTransition } from "react";
import { noShowAction } from "../server/decision-actions";

type Person = { id: string; label: string; noShow: boolean };

/** BKG-013: toggles no-show for the host and each attendee of a past booking. */
export function NoShowControls({ bookingId, host, attendees }: { bookingId: string; host: { noShow: boolean }; attendees: Person[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const people: Person[] = [{ id: "host", label: "You (host)", noShow: host.noShow }, ...attendees];

  const toggle = (target: string, noShow: boolean) =>
    startTransition(async () => {
      const result = await noShowAction({ bookingId, target, noShow });
      setError(result.status === "error" ? (result.message ?? "That didn't work.") : null);
    });

  return (
    <fieldset className="flex flex-col gap-1 text-sm" disabled={pending}>
      <legend className="mb-1 font-medium">No-show</legend>
      {people.map((p) => (
        <label key={p.id} className="flex items-center gap-2">
          <input type="checkbox" defaultChecked={p.noShow} onChange={(e) => toggle(p.id, e.target.checked)} />
          {p.label}
        </label>
      ))}
      {error && <p className="text-danger">{error}</p>}
    </fieldset>
  );
}
