import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HEADER_BUTTON_CLASS, PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { CopyButton } from "@/features/dashboard/components/copy-button";
import { DeleteFormButton } from "@/features/routing-forms/components/delete-form-button";
import { RoutingFormBuilder } from "@/features/routing-forms/components/routing-form-builder";
import { saveRoutingFormAction } from "@/features/routing-forms/server/actions";
import { getManagedForm, listEventTypeOptions, RoutingError } from "@/features/routing-forms/server/service";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Edit routing form" };

const CARD = "gap-4 px-4 py-4 md:px-6 md:py-5";

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
    <div className={PAGE_CLASS}>
      <div className="flex flex-col gap-2">
        <Link href="/routing-forms" className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Routing forms
        </Link>
        <PageHeader
          title={form.name}
          description={form.disabled ? "Closed: this form doesn't accept responses." : "Accepting responses."}
          actions={
            <>
              <CopyButton value={publicUrl} variant="outline" className={`${HEADER_BUTTON_CLASS} bg-card`}>
                Copy link
              </CopyButton>
              <Button asChild variant="outline" className={`${HEADER_BUTTON_CLASS} bg-card`}>
                <Link href={`/routing-forms/${form.id}/responses`}>View responses</Link>
              </Button>
            </>
          }
        />
      </div>
      <section aria-labelledby="share-title">
        <Card className={CARD}>
          <h2 id="share-title" className="text-base font-semibold">
            Share
          </h2>
          <div className="flex flex-col gap-1">
            <p className="text-[13px] font-medium">Public link</p>
            <a href={publicUrl} className="font-mono text-[13px] break-all text-highlight-text underline-offset-4 hover:underline">
              {publicUrl}
            </a>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[13px] font-medium">Embed</p>
            <pre tabIndex={0} aria-label="Embed code" className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
              {embedSnippet}
            </pre>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[13px] font-medium">Headless routing</p>
            <p className="text-[13px] text-muted-foreground">Send answers as URL parameters and the visitor is redirected immediately:</p>
            <pre tabIndex={0} aria-label="Headless routing URL" className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{`${publicUrl}/route?${firstKey}=value`}</pre>
          </div>
        </Card>
      </section>
      <Card className={CARD}>
        <RoutingFormBuilder
          initial={{
            name: form.name,
            description: form.description,
            fields: form.fields,
            rules: form.rules,
            fallback: form.fallback,
            disabled: form.disabled,
          }}
          ownerKey={key}
          eventTypesByOwner={{ [key]: eventTypes }}
          action={saveRoutingFormAction.bind(null, form.id)}
        />
      </Card>
      <section aria-labelledby="delete-title">
        <Card className={CARD}>
          <div className="flex flex-col gap-1">
            <h2 id="delete-title" className="text-base font-semibold">
              Delete
            </h2>
            <p className="text-[13px] text-muted-foreground">Deletes the form and all of its responses.</p>
          </div>
          <DeleteFormButton formId={form.id} name={form.name} />
        </Card>
      </section>
    </div>
  );
}
