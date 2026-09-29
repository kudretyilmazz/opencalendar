import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/features/dashboard/components/copy-button";
import { cn } from "@/lib/cn";
import { routeLabels, type Titles } from "../overview";
import type { FormListItem } from "../server/service";
import { AcceptingSwitch } from "./accepting-switch";

/** Desktop grid of the forms table (the design's five columns). */
const COLS = "lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_220px_80px_150px] lg:items-center lg:gap-5 lg:px-5";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Ten bars, one per 3 days; empty buckets show as a short pale bar. */
function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
  const max = Math.max(1, ...values);
  return (
    <div role="img" aria-label={label} className="flex h-7 items-end gap-[3px]">
      {values.map((v, i) => (
        <span
          // Positional buckets: the index is the identity.
          key={i}
          className={cn("w-2 rounded-[2px]", v > 0 ? "bg-highlight" : "bg-highlight-border")}
          style={{ height: `${Math.max(3, Math.round((v / max) * 26))}px` }}
        />
      ))}
    </div>
  );
}

function FormRow({ form, titles, trend, appUrl }: { form: FormListItem; titles: Titles; trend: readonly number[]; appUrl: string }) {
  const total = trend.reduce((a, b) => a + b, 0);
  const path = `/forms/${form.id}`;
  const meta = [plural(form.fields.length, "question"), form.teamName, path].filter(Boolean).join(" · ");
  return (
    <li className={cn("flex flex-col gap-3 border-t border-border px-4 py-4 first:border-t-0 lg:py-4", COLS)}>
      <div className="flex min-w-0 flex-col gap-1">
        <Link href={`/routing-forms/${form.id}`} className="w-fit text-[15px] font-semibold text-foreground underline-offset-4 hover:underline">
          {form.name}
        </Link>
        <span className="truncate text-xs text-muted-foreground" title={meta}>
          {meta}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="sr-only">Routes to:</span>
        {routeLabels(form, titles).map((label) => (
          <span key={label} className="inline-flex max-w-full items-center truncate rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
            {label}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span aria-hidden className="w-9 text-lg font-semibold tabular-nums">
          {total}
        </span>
        <Sparkline values={trend} label={`${plural(total, "response")} in the last 30 days, in 3-day steps: ${trend.join(", ")}`} />
      </div>
      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="text-sm text-muted-foreground lg:hidden">Accepting responses</span>
        <AcceptingSwitch formId={form.id} name={form.name} accepting={!form.disabled} />
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-2 lg:flex lg:justify-end lg:gap-0.5">
        <CopyButton
          value={`${appUrl}${path}`}
          variant="ghost"
          size="icon"
          aria-label={`Copy link to ${form.name}`}
          className="size-11 rounded-md text-muted-foreground lg:size-9"
        />
        <Button asChild variant="outline" className="h-11 rounded-md bg-card px-3.5 text-[13px] lg:h-9">
          <Link href={`/routing-forms/${form.id}/responses`}>Responses</Link>
        </Button>
      </div>
    </li>
  );
}

/** Every routing form the user manages, as a card table (RTE-001). */
export function FormsTable({
  forms,
  titles,
  trend,
  appUrl,
}: {
  forms: readonly FormListItem[];
  titles: Titles;
  trend: Readonly<Record<string, number[]>>;
  appUrl: string;
}) {
  return (
    <Card aria-label="Your routing forms" role="region" className="gap-0 py-0">
      <div aria-hidden className={cn("hidden h-9 border-b border-border bg-background text-xs font-medium text-muted-foreground", COLS)}>
        <span>Form</span>
        <span>Routes to</span>
        <span>Responses · 30 days</span>
        <span>Accepting</span>
        <span />
      </div>
      <ul>
        {forms.map((form) => (
          <FormRow key={form.id} form={form} titles={titles} trend={trend[form.id] ?? []} appUrl={appUrl} />
        ))}
      </ul>
    </Card>
  );
}
