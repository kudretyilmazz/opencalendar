import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { EmailForm } from "@/features/instance/components/email-form";
import { loadInstanceSettings } from "@/features/instance/server/service";

export const metadata: Metadata = { title: "Emails" };

export default async function EmailsPage() {
  const settings = await loadInstanceSettings(getDb());
  return <EmailForm settings={settings} />;
}
