import { Button } from "@/components/ui/primitives";
import { redeliverAction } from "../server/actions";
import type { DeliverySummary } from "../server/service";

const STATUS_STYLES: Record<DeliverySummary["status"], string> = {
  success: "bg-success/10 text-success",
  failed: "bg-danger/10 text-danger",
  pending: "bg-accent",
};

const time = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19) + " UTC";

/** Recent deliveries of one webhook (API-003) with a manual retry for failed ones. */
export function DeliveryLog({
  deliveries,
  label,
  redeliver = redeliverAction,
}: {
  deliveries: readonly DeliverySummary[];
  label: string;
  /** Defaults to the personal retry action; team scope passes its team-bound one. */
  redeliver?: (deliveryId: string) => Promise<void>;
}) {
  if (deliveries.length === 0) return <p className="text-sm text-muted">No deliveries yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Recent deliveries for {label}</caption>
        <thead className="text-xs text-muted">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">Time</th>
            <th scope="col" className="py-1 pr-3 font-medium">Trigger</th>
            <th scope="col" className="py-1 pr-3 font-medium">Status</th>
            <th scope="col" className="py-1 pr-3 font-medium">Code</th>
            <th scope="col" className="py-1 pr-3 font-medium">Latency</th>
            <th scope="col" className="py-1 pr-3 font-medium">Attempts</th>
            <th scope="col" className="py-1 font-medium"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {deliveries.map((d) => (
            <tr key={d.id}>
              <td className="whitespace-nowrap py-1.5 pr-3">{time(d.createdAt)}</td>
              <td className="py-1.5 pr-3 font-mono text-xs">{d.trigger}</td>
              <td className="py-1.5 pr-3">
                <span className={`rounded px-1.5 text-xs ${STATUS_STYLES[d.status]}`} title={d.error ?? undefined}>
                  {d.status}
                </span>
                {d.error && <span className="ml-2 text-xs text-muted">{d.error}</span>}
              </td>
              <td className="py-1.5 pr-3">{d.responseStatus ?? "—"}</td>
              <td className="py-1.5 pr-3">{d.latencyMs === null ? "—" : `${d.latencyMs} ms`}</td>
              <td className="py-1.5 pr-3">{d.attempts}</td>
              <td className="py-1.5">
                {d.status === "failed" && (
                  <form action={redeliver.bind(null, d.id)}>
                    <Button type="submit" variant="ghost" className="h-7 px-2" aria-label={`Retry ${d.trigger} delivery from ${time(d.createdAt)}`}>
                      Retry
                    </Button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
