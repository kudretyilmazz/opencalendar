import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HEADER_BUTTON_CLASS, PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { FormsTable } from "@/features/routing-forms/components/forms-table";
import { LatestResponsesCard, RulesSummaryCard } from "@/features/routing-forms/components/overview-cards";
import { loadRoutingOverview } from "@/features/routing-forms/server/overview";
import { getProfile } from "@/features/settings/server/service";
import { requireUser } from "@/lib/auth/session";
import { requestTime } from "@/lib/clock";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Routing forms" };

export default async function RoutingFormsPage() {
  const user = await requireUser();
  const db = getDb();
  const now = requestTime();
  const [overview, profile] = await Promise.all([loadRoutingOverview(db, user.id, now), getProfile(db, user.id)]);
  const prefs = { locale: profile?.locale ?? "en", timeZone: profile?.timeZone ?? "UTC", hour12: profile?.timeFormat === 12 };
  const appUrl = getEnv().APP_URL.replace(/\/$/, "");
  const { forms, titles, trend, latest } = overview;
  const first = forms[0];

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Routing forms"
        description="Ask a few questions first, then send people to the right event type or a message."
        actions={
          <Button asChild className={HEADER_BUTTON_CLASS}>
            <Link href="/routing-forms/new">
              <Plus aria-hidden />
              New form
            </Link>
          </Button>
        }
      />
      {!first ? (
        <Card className="gap-0 px-4 py-4 md:px-5 md:py-[18px]">
          <p className="text-sm text-muted-foreground">No routing forms yet.</p>
        </Card>
      ) : (
        <>
          <FormsTable forms={forms} titles={titles} trend={trend} appUrl={appUrl} />
          <div className="grid items-start gap-5 md:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <LatestResponsesCard responses={latest} forms={forms} titles={titles} now={now} prefs={prefs} csvForm={first} />
            <RulesSummaryCard form={first} titles={titles} />
          </div>
        </>
      )}
    </div>
  );
}
