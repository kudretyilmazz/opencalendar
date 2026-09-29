import { getDb } from "@/db/client";
import { getProfile } from "@/features/settings/server/service";
import { requestTime } from "@/lib/clock";
import { getEnv } from "@/lib/env";
import { teamWebhookOverview } from "../server/overview";
import {
  createTeamWebhookAction,
  deleteTeamWebhookAction,
  pingTeamWebhookAction,
  redeliverTeamAction,
  rollTeamSecretAction,
  setTeamWebhookActiveAction,
  updateTeamTriggersAction,
} from "../server/team-actions";
import { CreateWebhookForm } from "./create-webhook-form";
import { WebhookList } from "./webhook-list";

/**
 * Webhooks of a team (API-001), for admins. Fires for bookings of the team's event types and of
 * managed copies of its templates, and for the team's routing forms. Loads its own data through
 * the admin-checked overview, so it can be dropped onto the team page as is. Uses the same cards
 * and delivery log as the personal webhooks page.
 */
export async function TeamWebhooksPanel({ teamId, userId }: { teamId: string; userId: string }) {
  const db = getDb();
  const now = requestTime();
  const [overview, profile] = await Promise.all([teamWebhookOverview(db, userId, teamId, now), getProfile(db, userId)]);
  const prefs = { locale: profile?.locale ?? "en", timeZone: profile?.timeZone ?? "UTC", hour12: profile?.timeFormat === 12 };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Webhooks</h2>
        <p className="text-[13px] text-muted-foreground">
          Signed JSON POSTs for bookings of this team&apos;s event types and its routing form submissions.
        </p>
      </div>
      <WebhookList
        overview={overview}
        now={now}
        prefs={prefs}
        headingLevel={3}
        emptyText="No team webhooks yet."
        scopeLabel={() => "All team event types"}
        actionsFor={(hook) => ({
          setActive: setTeamWebhookActiveAction.bind(null, teamId, hook.id),
          remove: deleteTeamWebhookAction.bind(null, teamId, hook.id),
          updateTriggers: updateTeamTriggersAction.bind(null, teamId, hook.id),
          roll: rollTeamSecretAction.bind(null, teamId, hook.id),
          ping: pingTeamWebhookAction.bind(null, teamId, hook.id),
        })}
        redeliver={redeliverTeamAction.bind(null, teamId)}
      />
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Add a team webhook</h3>
        <CreateWebhookForm allowPrivate={getEnv().WEBHOOK_ALLOW_PRIVATE} action={createTeamWebhookAction.bind(null, teamId)} />
      </div>
    </div>
  );
}
