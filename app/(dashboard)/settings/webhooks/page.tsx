import type { Metadata } from "next";
import { Button, Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { CreateWebhookForm } from "@/features/webhooks/components/create-webhook-form";
import { DeliveryLog } from "@/features/webhooks/components/delivery-log";
import { PingButton, RollSecretButton, TriggerEditor } from "@/features/webhooks/components/webhook-controls";
import { deleteWebhookAction, setWebhookActiveAction } from "@/features/webhooks/server/actions";
import { listDeliveries, listOwnerEventTypes, listWebhooks } from "@/features/webhooks/server/service";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Webhooks" };

export default async function WebhooksPage() {
  const user = await requireUser();
  const env = getEnv();
  const db = getDb();
  const [webhooks, eventTypes] = await Promise.all([listWebhooks(db, user.id), listOwnerEventTypes(db, user.id)]);
  const deliveries = await Promise.all(webhooks.map((hook) => listDeliveries(db, user.id, hook.id)));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Webhooks</h1>
        <p className="text-sm text-muted">
          OpenCalendar sends a signed JSON POST to your endpoint when your bookings change or your routing forms are submitted. These webhooks cover your personal event types; team event types are covered by the webhooks on the team page. See the{" "}
          <a className="underline" href={`${env.SOURCE_URL}/blob/main/docs/03-architecture/api-and-webhooks.md#webhooks`}>
            payload and signature docs
          </a>
          .
        </p>
      </div>

      {webhooks.length === 0 ? (
        <Card className="text-sm text-muted">No webhooks yet.</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {webhooks.map((hook, i) => (
            <li key={hook.id}>
              <Card className="flex flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-medium">{hook.url}</p>
                    <p className="text-sm text-muted">
                      {hook.eventTypeTitle ? `Event type: ${hook.eventTypeTitle}` : "All event types"} · payload v{hook.payloadVersion}
                      {!hook.active && " · paused"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action={setWebhookActiveAction.bind(null, hook.id, !hook.active)}>
                      <Button type="submit" variant="secondary" className="h-9" aria-pressed={hook.active} aria-label={`${hook.active ? "Pause" : "Resume"} ${hook.url}`}>
                        {hook.active ? "Pause" : "Resume"}
                      </Button>
                    </form>
                    <form action={deleteWebhookAction.bind(null, hook.id)}>
                      <Button type="submit" variant="ghost" className="h-9" aria-label={`Delete webhook ${hook.url}`}>
                        Delete
                      </Button>
                    </form>
                  </div>
                </div>
                <TriggerEditor webhookId={hook.id} triggers={hook.triggers} />
                <div className="flex flex-wrap gap-4">
                  <PingButton webhookId={hook.id} label={hook.url} />
                  <RollSecretButton webhookId={hook.id} label={hook.url} />
                </div>
                <section aria-label={`Recent deliveries for ${hook.url}`} className="flex flex-col gap-2">
                  <h2 className="text-sm font-medium">Recent deliveries</h2>
                  <DeliveryLog deliveries={deliveries[i]} label={hook.url} />
                </section>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Add a webhook</h2>
        <CreateWebhookForm eventTypes={eventTypes} allowPrivate={env.WEBHOOK_ALLOW_PRIVATE} />
      </Card>
    </div>
  );
}
