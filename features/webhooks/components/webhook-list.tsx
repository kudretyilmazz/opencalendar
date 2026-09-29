import { Card } from "@/components/ui/card";
import type { FormatPrefs } from "@/lib/format";
import { deliveredPercent, deliveryRow } from "../overview";
import { MAX_DELIVERY_ATTEMPTS, type WebhookOverview } from "../server/overview";
import type { WebhookSummary } from "../server/scoped";
import { DeliveryLog } from "./delivery-log";
import { WebhookCard, type WebhookCardActions } from "./webhook-card";

/**
 * A scope's webhook cards followed by its recent deliveries (API-001, API-003). The personal page
 * and the team panel pass their own scope-bound actions and wording.
 */
export function WebhookList({
  overview,
  now,
  prefs,
  scopeLabel,
  actionsFor,
  redeliver,
  headingLevel = 2,
  emptyText,
}: {
  overview: WebhookOverview;
  now: number;
  prefs: FormatPrefs;
  scopeLabel: (hook: WebhookSummary) => string;
  actionsFor: (hook: WebhookSummary) => WebhookCardActions;
  redeliver: (deliveryId: string) => Promise<void>;
  headingLevel?: 2 | 3;
  emptyText: string;
}) {
  const rows = overview.recent.map((d) => deliveryRow(d, { now, prefs, maxAttempts: MAX_DELIVERY_ATTEMPTS }));
  if (overview.webhooks.length === 0)
    return (
      <Card className="gap-0 px-4 py-4 md:px-5 md:py-[18px]">
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </Card>
    );
  return (
    <>
      <ul className="flex flex-col gap-4 md:gap-6">
        {overview.webhooks.map((hook) => (
          <WebhookCard
            key={hook.id}
            hook={hook}
            latest={overview.latestByWebhook[hook.id] ?? []}
            now={now}
            scopeLabel={scopeLabel(hook)}
            actions={actionsFor(hook)}
            headingLevel={headingLevel}
          />
        ))}
      </ul>
      <DeliveryLog rows={rows} deliveredPercent={deliveredPercent(overview.week)} redeliver={redeliver} headingLevel={headingLevel} />
    </>
  );
}
