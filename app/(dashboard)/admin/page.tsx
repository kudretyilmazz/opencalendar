import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getDb } from "@/db/client";
import { userCounts } from "@/features/admin-users/server/service";
import { effectiveSignupMode } from "@/features/auth/server/queries";
import { loadInstanceSettings } from "@/features/instance/server/service";
import { settingsCardClass } from "@/features/settings/components/settings-section";
import { getEnv, UPSTREAM_SOURCE_URL } from "@/lib/env";

export const metadata: Metadata = { title: "Administration" };

const MODE_LABELS = { open: "Open to everyone", invite_only: "Invite only", disabled: "Closed" } as const;

function Stat({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Link href={href} className={`${settingsCardClass} flex flex-col gap-1 p-4 transition-colors hover:bg-muted/40 md:px-6 md:py-5`}>
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
    </Link>
  );
}

export default async function AdminOverviewPage() {
  const db = getDb();
  const env = getEnv();
  const [counts, settings, mode] = await Promise.all([userCounts(db), loadInstanceSettings(db), effectiveSignupMode(db, env)]);
  return (
    <>
      <PageHeader title="Administration" description={`Instance settings for ${settings.appName}.`} />
      {settings.hideSourceLink && env.SOURCE_URL === UPSTREAM_SOURCE_URL && (
        <Alert>
          <AlertDescription>
            The footer source link is hidden and SOURCE_URL points to the upstream repository. If you run a modified version,
            point SOURCE_URL to your fork so /about offers the right code (AGPL-3.0 §13).
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Accounts" value={counts.total} href="/admin/users" />
        <Stat label="Active administrators" value={counts.admins} href="/admin/users?role=admin&status=active" />
        <Stat label="Disabled accounts" value={counts.disabled} href="/admin/users?status=disabled" />
        <Stat label="Sign-ups" value={MODE_LABELS[mode]} href="/admin/platform" />
      </div>
    </>
  );
}
