import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { listForms } from "@/features/routing-forms/server/service";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Routing forms" };

export default async function RoutingFormsPage() {
  const user = await requireUser();
  const forms = await listForms(getDb(), user.id);
  const appUrl = getEnv().APP_URL;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Routing forms</h1>
          <p className="text-sm text-muted">Ask a few questions and send visitors to the right event type, page or message.</p>
        </div>
        <Link href="/routing-forms/new" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          New form
        </Link>
      </div>
      {forms.length === 0 ? (
        <Card className="text-sm text-muted">No routing forms yet.</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {forms.map((f) => (
            <li key={f.id}>
              <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className={f.disabled ? "opacity-60" : ""}>
                  <Link href={`/routing-forms/${f.id}`} className="font-medium underline-offset-4 hover:underline">
                    {f.name}
                  </Link>
                  {f.teamName && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs">{f.teamName}</span>}
                  {f.disabled && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs">Off</span>}
                  <p className="text-sm text-muted">
                    {appUrl}/forms/{f.id}
                  </p>
                </div>
                <Link href={`/routing-forms/${f.id}/responses`} className="text-sm font-medium underline-offset-4 hover:underline">
                  Responses
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
