import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PAGE_CLASS } from "@/components/page-header";
import { getDb } from "@/db/client";
import { DeleteAccount } from "@/features/account/components/delete-account";
import { ProfileForm } from "@/features/settings/components/profile-form";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { listTimeZones } from "@/features/settings/schemas";
import { getProfile } from "@/features/settings/server/service";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Settings" };

export default async function ProfileSettingsPage() {
  const user = await requireUser();
  const profile = await getProfile(getDb(), user.id);
  if (!profile) notFound();
  const host = getEnv().APP_URL.replace(/\/$/, "").replace(/^https?:\/\//, "");

  return (
    <div className={PAGE_CLASS}>
      <ProfileForm profile={profile} timeZones={listTimeZones()} host={host} isAdmin={user.role === "admin"} />
      <SettingsSection id="danger" title="Danger zone" description="This can't be undone." danger>
        <DeleteAccount email={profile.email} />
      </SettingsSection>
    </div>
  );
}
