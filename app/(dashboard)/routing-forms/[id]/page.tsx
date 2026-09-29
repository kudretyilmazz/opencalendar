import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { RoutingFormBuilder } from "@/features/routing-forms/components/routing-form-builder";
import { deleteRoutingFormAction, saveRoutingFormAction } from "@/features/routing-forms/server/actions";
import { getManagedForm, listEventTypeOptions, RoutingError } from "@/features/routing-forms/server/service";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Edit routing form" };

export default async function EditRoutingFormPage({ params }: PageProps<"/routing-forms/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const db = getDb();
  const form = await getManagedForm(db, user.id, id).catch((error: unknown) => {
    if (error instanceof RoutingError) return null;
    throw error;
  });
  if (!form) notFound();
  const eventTypes = await listEventTypeOptions(db, { userId: form.ownerUserId, teamId: form.teamId });
  const key = form.teamId ?? "personal";
  const publicUrl = `${getEnv().APP_URL}/forms/${form.id}`;
  const embedSnippet = `<iframe src="${publicUrl}?embed=1" title="${form.name.replace(/["<>&]/g, "")}" width="100%" height="480" style="border:0"></iframe>`;
  const firstKey = form.fields[0]?.key ?? "field";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/routing-forms" className="text-sm text-muted underline-offset-4 hover:underline">
            ← Routing forms
          </Link>
          <h1 className="text-2xl font-semibold">{form.name}</h1>
        </div>
        <Link href={`/routing-forms/${form.id}/responses`} className="text-sm font-medium underline-offset-4 hover:underline">
          View responses
        </Link>
      </div>
      <Card className="flex flex-col gap-3 text-sm">
        <div>
          <p className="font-medium">Public link</p>
          <a href={publicUrl} className="break-all underline-offset-4 hover:underline">
            {publicUrl}
          </a>
        </div>
        <div>
          <p className="font-medium">Embed</p>
          <pre tabIndex={0} aria-label="Embed code" className="overflow-x-auto rounded-md bg-accent p-2 text-xs">{embedSnippet}</pre>
        </div>
        <div>
          <p className="font-medium">Headless routing</p>
          <p className="text-muted">Send answers as URL parameters and the visitor is redirected immediately:</p>
          <pre tabIndex={0} aria-label="Headless routing URL" className="overflow-x-auto rounded-md bg-accent p-2 text-xs">{`${publicUrl}/route?${firstKey}=value`}</pre>
        </div>
      </Card>
      <Card>
        <RoutingFormBuilder
          initial={{ name: form.name, description: form.description, fields: form.fields, rules: form.rules, fallback: form.fallback, disabled: form.disabled }}
          ownerKey={key}
          eventTypesByOwner={{ [key]: eventTypes }}
          action={saveRoutingFormAction.bind(null, form.id)}
        />
      </Card>
      <Card>
        <h2 className="mb-2 font-medium">Delete</h2>
        <p className="mb-3 text-sm text-muted">Deletes the form and all of its responses.</p>
        <form action={deleteRoutingFormAction.bind(null, form.id)}>
          <Button variant="secondary">Delete routing form</Button>
        </form>
      </Card>
    </div>
  );
}
