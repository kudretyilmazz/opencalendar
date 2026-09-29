import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { type DeliveryFacts, lastDeliveryText, webhookHealth, type Health } from "../overview";
import type { WebhookSummary } from "../server/scoped";
import { ActiveSwitch, type BoundAction, type BoundFormAction, SecretRow, WebhookMenu } from "./webhook-controls";

const HEALTH: Record<Health, { label: string; dot: string; variant: "success" | "danger" | "muted" }> = {
  active: { label: "Active", dot: "bg-success", variant: "success" },
  failing: { label: "Failing", dot: "bg-destructive", variant: "danger" },
  paused: { label: "Paused", dot: "bg-muted-foreground", variant: "muted" },
};

export type WebhookCardActions = {
  setActive: (active: boolean) => Promise<void>;
  remove: () => Promise<void>;
  updateTriggers: BoundFormAction;
  roll: BoundAction;
  ping: BoundAction;
};

/**
 * One webhook subscription (API-001): health, endpoint, pause switch, "…" menu, triggers and the
 * signing secret row. Shared by the personal page and the team panel, which pass their own
 * scope-bound server actions.
 */
export function WebhookCard({
  hook,
  latest,
  now,
  scopeLabel,
  actions,
  headingLevel = 2,
}: {
  hook: WebhookSummary;
  latest: readonly DeliveryFacts[];
  now: number;
  scopeLabel: string;
  actions: WebhookCardActions;
  /** 2 on the webhooks page, 3 inside the team page's "Webhooks" section. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const health = HEALTH[webhookHealth(hook.active, latest)];
  return (
    <li>
      <Card className="gap-3.5 px-4 py-4 md:px-5 md:py-[18px]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", health.dot)} />
          <Heading className="min-w-0 flex-1 font-mono text-sm font-medium break-all md:flex-initial">{hook.url}</Heading>
          <Badge variant={health.variant} className="h-auto rounded-full px-2 py-0.5">
            {health.label}
          </Badge>
          <span className="order-last basis-full pl-5 text-xs text-muted-foreground md:order-none md:ml-auto md:basis-auto md:pl-0">
            {lastDeliveryText(latest, now)}
          </span>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <ActiveSwitch url={hook.url} active={hook.active} action={actions.setActive} />
            <WebhookMenu webhookId={hook.id} url={hook.url} triggers={hook.triggers} updateTriggers={actions.updateTriggers} remove={actions.remove} />
          </div>
        </div>
        <ul aria-label={`Triggers of ${hook.url}`} className="flex flex-wrap gap-1.5 md:pl-5">
          {hook.triggers.map((trigger) => (
            <li key={trigger} className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
              {trigger}
            </li>
          ))}
        </ul>
        <SecretRow url={hook.url} scopeLabel={scopeLabel} roll={actions.roll} ping={actions.ping} />
      </Card>
    </li>
  );
}
