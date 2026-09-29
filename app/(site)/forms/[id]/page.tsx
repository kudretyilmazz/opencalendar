import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { PublicRoutingForm, RoutingMessage } from "@/features/routing-forms/components/public-form";
import { rawAnswersFromParams } from "@/features/routing-forms/schemas";
import { submitRoutingFormAction } from "@/features/routing-forms/server/actions";
import { getPublicForm, getResponseMessage } from "@/features/routing-forms/server/service";
import { cn } from "@/lib/cn";
import { parseEmbedOptions } from "@/lib/embed/protocol";

export async function generateMetadata({ params }: PageProps<"/forms/[id]">): Promise<Metadata> {
  const { id } = await params;
  const form = await getPublicForm(getDb(), id);
  return { title: form?.name ?? "Not found" };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Public routing form (RTE-001, RTE-006). Query parameters named after the fields prefill the
 * answers, `?message=<responseId>` shows the message a headless submission resolved to, and
 * `?embed=1` renders the compact embed variant.
 */
export default async function RoutingFormPage({ params, searchParams }: PageProps<"/forms/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const db = getDb();
  const form = await getPublicForm(db, id);
  if (!form) notFound();

  const messageId = one(query.message);
  const message = messageId ? await getResponseMessage(db, id, messageId) : null;
  const embed = parseEmbedOptions(query);
  const theme = embed?.theme === "dark" ? "dark" : embed?.theme === "light" ? "light" : undefined;
  const brand = embed?.brand ? ({ "--primary": embed.brand, "--primary-foreground": "#ffffff", "--ring": embed.brand } as CSSProperties) : undefined;

  return (
    <main className={cn("mx-auto flex w-full flex-1 flex-col", embed ? "max-w-xl bg-background p-4 text-foreground" : "max-w-xl px-4 py-10", theme)} style={brand}>
      <Card className={cn("[--card-spacing:--spacing(6)]", embed ? "rounded-none shadow-none ring-0" : "shadow-sm")}>
        <CardContent>
        {message ? (
          <RoutingMessage message={message} />
        ) : (
          <PublicRoutingForm
            formId={form.id}
            name={form.name}
            description={form.description}
            fields={form.fields}
            prefill={rawAnswersFromParams(form.fields, query)}
            embed={Boolean(embed)}
            submit={submitRoutingFormAction.bind(null, form.id)}
          />
        )}
        </CardContent>
      </Card>
    </main>
  );
}
