import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HEADER_BUTTON_CLASS, PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { describeAction } from "@/features/routing-forms/server/csv";
import { listResponses, RoutingError } from "@/features/routing-forms/server/service";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Routing form responses" };

const answerText = (value: string | string[] | number | undefined): string =>
  Array.isArray(value) ? value.join(", ") : value === undefined ? "" : String(value);

export default async function RoutingResponsesPage({ params }: PageProps<"/routing-forms/[id]/responses">) {
  const { id } = await params;
  const user = await requireUser();
  const found = await listResponses(getDb(), user.id, id).catch((error: unknown) => {
    if (error instanceof RoutingError) return null;
    throw error;
  });
  if (!found) notFound();
  const { form, rows } = found;
  const ruleNumber = (ruleId: string) => form.rules.findIndex((r) => r.id === ruleId) + 1;

  return (
    <div className={PAGE_CLASS}>
      <div className="flex flex-col gap-2">
        <Link href={`/routing-forms/${form.id}`} className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← {form.name}
        </Link>
        <PageHeader
          title="Responses"
          description={`${rows.length} most recent response${rows.length === 1 ? "" : "s"} to ${form.name}.`}
          actions={
            <Button asChild variant="outline" className={`${HEADER_BUTTON_CLASS} bg-card`}>
              <a href={`/api/routing-forms/${form.id}/responses`} download>
                <Download aria-hidden />
                Download CSV
              </a>
            </Button>
          }
        />
      </div>
      {rows.length === 0 ? (
        <Card className="gap-0 px-4 py-4 md:px-5 md:py-[18px]">
          <p className="text-sm text-muted-foreground">No responses yet.</p>
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <Table>
            <TableCaption className="sr-only">Responses to {form.name}</TableCaption>
            <TableHeader className="bg-background">
              <TableRow>
                <TableHead scope="col" className="px-4 text-xs font-medium text-muted-foreground">
                  Time
                </TableHead>
                {form.fields.map((f) => (
                  <TableHead key={f.key} scope="col" className="px-4 text-xs font-medium text-muted-foreground">
                    {f.label || f.key}
                  </TableHead>
                ))}
                <TableHead scope="col" className="px-4 text-xs font-medium text-muted-foreground">
                  Matched
                </TableHead>
                <TableHead scope="col" className="px-4 text-xs font-medium text-muted-foreground">
                  Target
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="[&>td]:align-top">
                  <TableCell className="px-4 text-xs font-medium text-muted-foreground">
                    <time dateTime={r.createdAt.toISOString()}>
                      {r.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC
                    </time>
                  </TableCell>
                  {form.fields.map((f) => (
                    <TableCell key={f.key} className="px-3 whitespace-normal">
                      {answerText(r.answers[f.key])}
                    </TableCell>
                  ))}
                  <TableCell className="px-4 text-xs font-medium text-muted-foreground">
                    {r.matchedRuleId === null
                      ? "Fallback"
                      : ruleNumber(r.matchedRuleId) > 0
                        ? `Rule ${ruleNumber(r.matchedRuleId)}`
                        : "Deleted rule"}
                    <span className="block text-xs text-muted-foreground">{r.trace.length} evaluated</span>
                  </TableCell>
                  <TableCell className="px-4 break-all whitespace-normal">{describeAction(r.action)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
