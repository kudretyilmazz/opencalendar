import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { getInstanceSettings } from "@/features/instance/server/service";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "About" };

/**
 * Always-available source offer (AGPL-3.0 §13, ADR-0001), whatever the footer settings are.
 */
export default async function AboutPage() {
  const settings = await getInstanceSettings(getDb());
  const sourceUrl = getEnv().SOURCE_URL;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{settings.appName}</h1>
      <p className="text-muted-foreground">{settings.description}</p>
      <p className="text-sm">
        {settings.appName} runs on OpenCalendar, free software licensed under the GNU Affero General Public License
        v3.0. You can get the source code of the software running this service at{" "}
        <a href={sourceUrl} className="font-medium underline underline-offset-4" rel="noopener">
          {sourceUrl}
        </a>
        .
      </p>
    </main>
  );
}
