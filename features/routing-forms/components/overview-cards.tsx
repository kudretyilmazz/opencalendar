import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { FormatPrefs } from "@/lib/format";
import { fallbackTarget, responseOutcome, responseSummary, responseWhen, ruleSummaries, type Titles } from "../overview";
import type { LatestResponse } from "../server/overview";
import type { RoutingFormRow } from "../server/service";

const OUTCOME_CLASS = {
  booked: "bg-highlight text-highlight-foreground",
  event: "bg-muted text-foreground",
  message: "border border-border text-muted-foreground",
} as const;

const pill = "inline-flex w-fit max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

/** The newest responses across all of the user's forms, with where each one ended up. */
export function LatestResponsesCard({
  responses,
  forms,
  titles,
  now,
  prefs,
  csvForm,
}: {
  responses: readonly LatestResponse[];
  forms: readonly Pick<RoutingFormRow, "id" | "name" | "fields">[];
  titles: Titles;
  now: number;
  prefs: FormatPrefs;
  /** The form whose responses "Download CSV" exports. */
  csvForm: { id: string; name: string };
}) {
  const formOf = new Map(forms.map((f) => [f.id, f]));
  const showFormName = forms.length > 1;
  return (
    <section aria-labelledby="latest-responses" className="min-w-0">
      <Card className="gap-0 py-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 md:px-5 md:py-[18px]">
          <h2 id="latest-responses" className="text-base font-semibold">
            Latest responses
          </h2>
          <a
            href={`/api/routing-forms/${csvForm.id}/responses`}
            download
            className="flex min-h-11 items-center text-[13px] font-medium text-highlight-text hover:underline md:min-h-0"
          >
            Download CSV<span className="sr-only"> of {csvForm.name}</span>
          </a>
        </div>
        {responses.length === 0 ? (
          <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground md:px-5">No responses yet.</p>
        ) : (
          <ul>
            {responses.map((r) => {
              const form = formOf.get(r.formId);
              const summary = responseSummary(form?.fields ?? [], r.answers);
              const outcome = responseOutcome(r.action, titles, r.bookedEventTitle);
              const details = [showFormName ? form?.name : null, summary.answers].filter(Boolean).join(" · ");
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-1.5 border-t border-border px-4 py-3.5 md:grid md:grid-cols-[90px_minmax(0,1fr)_auto] md:items-center md:gap-4 md:px-5"
                >
                  <time dateTime={r.createdAt.toISOString()} className="text-xs text-muted-foreground tabular-nums">
                    {responseWhen(r.createdAt.getTime(), now, prefs)}
                  </time>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{summary.who}</span>
                    {details && <span className="truncate text-xs text-muted-foreground">{details}</span>}
                  </div>
                  <span className={cn(pill, OUTCOME_CLASS[outcome.kind])}>{outcome.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}

/** The first form's rules in plain language: "If <question> is <answer> → <target>". */
export function RulesSummaryCard({ form, titles }: { form: Pick<RoutingFormRow, "id" | "name" | "fields" | "rules" | "fallback">; titles: Titles }) {
  const rules = ruleSummaries(form, titles);
  const item = "flex items-start gap-2.5 rounded-md bg-background px-3 py-2.5";
  const number = "flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-semibold text-muted-foreground";
  return (
    <section aria-labelledby="rules-summary" className="min-w-0">
      <Card className="gap-3.5 px-4 py-4 md:px-5 md:py-[18px]">
        <h2 id="rules-summary" className="truncate text-base font-semibold">
          {form.name} · rules
        </h2>
        <ol className="flex flex-col gap-2.5">
          {rules.map((rule, i) => (
            <li key={form.rules[i].id} className={item}>
              <span aria-hidden className={number}>
                {i + 1}
              </span>
              <span className="min-w-0 text-[13px] leading-normal break-words">
                If{" "}
                {rule.conditions.map((c, j) => (
                  <span key={`${c.field}-${j}`}>
                    {j > 0 && ` ${rule.joiner} `}
                    <strong>{c.field}</strong> {c.operator} <strong>{c.value}</strong>
                  </span>
                ))}{" "}
                → {rule.kind === "message" ? <>message “{rule.target}”</> : <strong>{rule.target}</strong>}
              </span>
            </li>
          ))}
          <li className={item}>
            <span aria-hidden className={number}>
              ↳
            </span>
            <span className="min-w-0 text-[13px] leading-normal break-words text-muted-foreground">
              {rules.length > 0 ? "Otherwise" : "Everyone"} →{" "}
              {form.fallback.kind === "message" ? (
                <>message “{fallbackTarget(form.fallback, titles)}”</>
              ) : (
                <strong className="text-foreground">{fallbackTarget(form.fallback, titles)}</strong>
              )}
            </span>
          </li>
        </ol>
        <Button asChild variant="outline" className="h-11 rounded-md bg-card px-3.5 text-[13px] md:h-9">
          <Link href={`/routing-forms/${form.id}`} aria-label={`Edit rules of ${form.name}`}>
            Edit rules
          </Link>
        </Button>
      </Card>
    </section>
  );
}
