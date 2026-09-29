import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { DeleteAccountForm } from "@/features/account/components/delete-account";
import { getDb } from "@/db/client";
import { ProfileForm } from "@/features/settings/components/profile-form";
import { listTimeZones } from "@/features/settings/schemas";
import { getProfile } from "@/features/settings/server/service";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };

export default async function ProfileSettingsPage() {
  const user = await requireUser();
  const profile = await getProfile(getDb(), user.id);
  if (!profile) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted">Your profile and how dates and times are shown.</p>
      </div>
      <Card>
        <ProfileForm profile={profile} timeZones={listTimeZones()} />
      </Card>
      <Card className="border-danger/30">
        <h2 className="mb-3 font-medium text-danger">Delete account</h2>
        <DeleteAccountForm email={profile.email} />
      </Card>
    </div>
  );
}
