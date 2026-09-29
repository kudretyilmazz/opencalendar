import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { describeAction } from "@/features/routing-forms/server/csv";
import { listResponses, RoutingError } from "@/features/routing-forms/server/service";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Routing form responses" };

const answerText = (value: string | string[] | number | undefined): string => (Array.isArray(value) ? value.join(", ") : value === undefined ? "" : String(value));

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href={`/routing-forms/${form.id}`} className="text-sm text-muted underline-offset-4 hover:underline">
            ← {form.name}
          </Link>
          <h1 className="text-2xl font-semibold">Responses</h1>
        </div>
        <a href={`/api/routing-forms/${form.id}/responses`} download className="text-sm font-medium underline-offset-4 hover:underline">
          Download CSV
        </a>
      </div>
      {rows.length === 0 ? (
        <Card className="text-sm text-muted">No responses yet.</Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Responses to {form.name}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2 font-medium">Time</th>
                {form.fields.map((f) => (
                  <th key={f.key} scope="col" className="px-3 py-2 font-medium">
                    {f.label || f.key}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 font-medium">Matched</th>
                <th scope="col" className="px-3 py-2 font-medium">Target</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 align-top">
                  <td className="whitespace-nowrap px-3 py-2">
                    <time dateTime={r.createdAt.toISOString()}>{r.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC</time>
                  </td>
                  {form.fields.map((f) => (
                    <td key={f.key} className="px-3 py-2">
                      {answerText(r.answers[f.key])}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.matchedRuleId === null ? "Fallback" : ruleNumber(r.matchedRuleId) > 0 ? `Rule ${ruleNumber(r.matchedRuleId)}` : "Deleted rule"}
                    <span className="block text-xs text-muted">{r.trace.length} evaluated</span>
                  </td>
                  <td className="px-3 py-2 break-all">{describeAction(r.action)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
