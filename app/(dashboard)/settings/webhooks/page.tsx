import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { HEADER_BUTTON_CLASS, PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { getProfile } from "@/features/settings/server/service";
import { CreateWebhookForm } from "@/features/webhooks/components/create-webhook-form";
import { WebhookList } from "@/features/webhooks/components/webhook-list";
import {
  deleteWebhookAction,
  pingWebhookAction,
  redeliverAction,
  rollSecretAction,
  setWebhookActiveAction,
  updateTriggersAction,
} from "@/features/webhooks/server/actions";
import { personalWebhookOverview } from "@/features/webhooks/server/overview";
import { listOwnerEventTypes } from "@/features/webhooks/server/service";
import { requireUser } from "@/lib/auth/session";
import { requestTime } from "@/lib/clock";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Webhooks" };

export default async function WebhooksPage() {
  const user = await requireUser();
  const env = getEnv();
  const db = getDb();
  const now = requestTime();
  const [overview, eventTypes, profile] = await Promise.all([personalWebhookOverview(db, user.id, now), listOwnerEventTypes(db, user.id), getProfile(db, user.id)]);
  const prefs = { locale: profile?.locale ?? "en", timeZone: profile?.timeZone ?? "UTC", hour12: profile?.timeFormat === 12 };

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Webhooks"
        description={
          <>
            We POST a signed JSON payload to your URL when bookings change or routing forms are submitted. Failed deliveries are retried.{" "}
            <a className="text-highlight-text underline underline-offset-4" href={`${env.SOURCE_URL}/blob/main/docs/03-architecture/api-and-webhooks.md#webhooks`}>
              Payload and signature docs
            </a>
          </>
        }
        actions={
          <Button asChild className={HEADER_BUTTON_CLASS}>
            <a href="#add-webhook">
              <Plus aria-hidden />
              Add webhook
            </a>
          </Button>
        }
      />
      <WebhookList
        overview={overview}
        now={now}
        prefs={prefs}
        emptyText="No webhooks yet."
        scopeLabel={(hook) => (hook.eventTypeTitle ? `${hook.eventTypeTitle} only` : "All my event types")}
        actionsFor={(hook) => ({
          setActive: setWebhookActiveAction.bind(null, hook.id),
          remove: deleteWebhookAction.bind(null, hook.id),
          updateTriggers: updateTriggersAction.bind(null, hook.id),
          roll: rollSecretAction.bind(null, hook.id),
          ping: pingWebhookAction.bind(null, hook.id),
        })}
        redeliver={redeliverAction}
      />
      <section id="add-webhook" aria-labelledby="add-webhook-title" className="scroll-mt-6">
        <Card className="gap-4 px-4 py-4 md:px-5 md:py-[18px]">
          <div className="flex flex-col gap-1">
            <h2 id="add-webhook-title" className="text-base font-semibold">
              Add a webhook
            </h2>
            <p className="text-[13px] text-muted-foreground">
              Covers your personal event types; team event types use the webhooks on each team page.
            </p>
          </div>
          <CreateWebhookForm eventTypes={eventTypes} allowPrivate={env.WEBHOOK_ALLOW_PRIVATE} />
        </Card>
      </section>
    </div>
  );
}
