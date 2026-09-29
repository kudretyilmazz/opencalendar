import type { Metadata } from "next";
import Link from "next/link";
import { PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { RoutingFormBuilder } from "@/features/routing-forms/components/routing-form-builder";
import { DEFAULT_ROUTING_FORM } from "@/features/routing-forms/schemas";
import { createRoutingFormAction } from "@/features/routing-forms/server/actions";
import { listEventTypeOptions, listManageableTeams } from "@/features/routing-forms/server/service";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New routing form" };

export default async function NewRoutingFormPage() {
  const user = await requireUser();
  const db = getDb();
  const teams = await listManageableTeams(db, user.id);
  const owners = [{ key: "personal", label: "Me" }, ...teams.map((t) => ({ key: t.id, label: t.name }))];
  const lists = await Promise.all(
    owners.map((o) => listEventTypeOptions(db, { userId: user.id, teamId: o.key === "personal" ? null : o.key })),
  );
  const eventTypesByOwner = Object.fromEntries(owners.map((o, i) => [o.key, lists[i]]));

  return (
    <div className={PAGE_CLASS}>
      <div className="flex flex-col gap-2">
        <Link href="/routing-forms" className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Routing forms
        </Link>
        <PageHeader title="New routing form" description="Add questions, then rules that decide where each visitor goes." />
      </div>
      <Card className="gap-4 px-4 py-4 md:px-6 md:py-5">
        <RoutingFormBuilder
          initial={DEFAULT_ROUTING_FORM}
          owners={owners}
          ownerKey="personal"
          eventTypesByOwner={eventTypesByOwner}
          action={createRoutingFormAction}
        />
      </Card>
    </div>
  );
}
