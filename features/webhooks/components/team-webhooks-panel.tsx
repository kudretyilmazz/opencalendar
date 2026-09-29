import { Button, Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import {
  createTeamWebhookAction,
  deleteTeamWebhookAction,
  pingTeamWebhookAction,
  redeliverTeamAction,
  rollTeamSecretAction,
  setTeamWebhookActiveAction,
  updateTeamTriggersAction,
} from "../server/team-actions";
import { listTeamDeliveries, listTeamWebhooks } from "../server/team-service";
import { CreateWebhookForm } from "./create-webhook-form";
import { DeliveryLog } from "./delivery-log";
import { PingButton, RollSecretButton, TriggerEditor } from "./webhook-controls";

/**
 * Webhooks of a team (API-001), for admins. Fires for bookings of the team's event types and of
 * managed copies of its templates, and for the team's routing forms. Loads its own data through
 * the admin-checked service, so it can be dropped onto the team page as is.
 */
export async function TeamWebhooksPanel({ teamId, userId }: { teamId: string; userId: string }) {
  const db = getDb();
  const webhooks = await listTeamWebhooks(db, userId, teamId);
  const deliveries = await Promise.all(webhooks.map((hook) => listTeamDeliveries(db, userId, teamId, hook.id)));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium">Webhooks</h2>
        <p className="text-sm text-muted">Signed JSON POSTs for bookings of this team&apos;s event types and its routing form submissions.</p>
      </div>
      {webhooks.length === 0 ? (
        <p className="text-sm text-muted">No team webhooks yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {webhooks.map((hook, i) => (
            <li key={hook.id}>
              <Card className="flex flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-medium">{hook.url}</p>
                    <p className="text-sm text-muted">
                      Payload v{hook.payloadVersion}
                      {!hook.active && " · paused"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action={setTeamWebhookActiveAction.bind(null, teamId, hook.id, !hook.active)}>
                      <Button type="submit" variant="secondary" className="h-9" aria-pressed={hook.active} aria-label={`${hook.active ? "Pause" : "Resume"} ${hook.url}`}>
                        {hook.active ? "Pause" : "Resume"}
                      </Button>
                    </form>
                    <form action={deleteTeamWebhookAction.bind(null, teamId, hook.id)}>
                      <Button type="submit" variant="ghost" className="h-9" aria-label={`Delete webhook ${hook.url}`}>
                        Delete
                      </Button>
                    </form>
                  </div>
                </div>
                <TriggerEditor webhookId={hook.id} triggers={hook.triggers} action={updateTeamTriggersAction.bind(null, teamId, hook.id)} />
                <div className="flex flex-wrap gap-4">
                  <PingButton webhookId={hook.id} label={hook.url} action={pingTeamWebhookAction.bind(null, teamId, hook.id)} />
                  <RollSecretButton webhookId={hook.id} label={hook.url} action={rollTeamSecretAction.bind(null, teamId, hook.id)} />
                </div>
                <section aria-label={`Recent deliveries for ${hook.url}`} className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">Recent deliveries</h3>
                  <DeliveryLog deliveries={deliveries[i]} label={hook.url} redeliver={redeliverTeamAction.bind(null, teamId)} />
                </section>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Add a team webhook</h3>
        <CreateWebhookForm allowPrivate={getEnv().WEBHOOK_ALLOW_PRIVATE} action={createTeamWebhookAction.bind(null, teamId)} />
      </div>
    </div>
  );
}
