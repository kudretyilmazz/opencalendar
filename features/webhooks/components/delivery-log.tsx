"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import type { DeliveryRow } from "../overview";

const TONES = { success: "success", danger: "danger", muted: "muted" } as const;

type Filter = "all" | "failed";

/**
 * Recent deliveries across a scope's webhooks (API-003) with an All/Failed filter, the
 * 7-day delivery rate and a manual retry for deliveries that finally failed.
 */
export function DeliveryLog({
  rows,
  deliveredPercent,
  redeliver,
  headingLevel = 2,
}: {
  rows: readonly DeliveryRow[];
  /** Share of the last 7 days' settled deliveries that succeeded; null when there were none. */
  deliveredPercent: number | null;
  redeliver: (deliveryId: string) => Promise<void>;
  headingLevel?: 2 | 3;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? rows : rows.filter((r) => r.failed);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const segment = (value: Filter, label: string) => (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
      className={cn(
        "h-11 rounded-md px-3 text-[13px] md:h-[30px]",
        filter === value ? "bg-card text-foreground shadow-xs hover:bg-card" : "text-muted-foreground",
      )}
    >
      {label}
    </Button>
  );

  return (
    <section aria-labelledby="deliveries-title">
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 md:px-5 md:py-[18px]">
          <Heading id="deliveries-title" className="text-base font-semibold">
            Recent deliveries
          </Heading>
          {deliveredPercent !== null && (
            <Badge
              variant={deliveredPercent >= 95 ? "success" : deliveredPercent >= 50 ? "warning" : "danger"}
              className="h-auto rounded-full px-2 py-0.5"
            >
              {deliveredPercent}% delivered · 7 days
            </Badge>
          )}
          <div role="group" aria-label="Filter deliveries" className="ml-auto flex gap-0.5 rounded-[10px] bg-muted p-[3px]">
            {segment("all", "All")}
            {segment("failed", "Failed")}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground md:px-5">
            {rows.length === 0 ? "No deliveries yet." : "No failed deliveries."}
          </p>
        ) : (
          <Table className="text-[13px]">
            <TableCaption className="sr-only">Recent webhook deliveries{filter === "failed" ? ", failed only" : ""}</TableCaption>
            <TableHeader className="bg-background">
              <TableRow className="hover:bg-transparent">
                {["Time", "Event", "Endpoint", "Response", "Duration", "Attempt"].map((h) => (
                  <TableHead key={h} scope="col" className="h-auto px-4 py-2.5 text-xs font-medium text-muted-foreground md:px-5">
                    {h}
                  </TableHead>
                ))}
                <TableHead scope="col" className="h-auto px-4 py-2.5 md:px-5">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="px-4 py-3 text-muted-foreground tabular-nums md:px-5">
                    <time dateTime={d.whenIso}>{d.when}</time>
                  </TableCell>
                  <TableCell className="px-4 py-3 font-mono text-xs md:px-5">{d.trigger}</TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground md:px-5">{d.endpoint}</TableCell>
                  <TableCell className="px-4 py-3 md:px-5">
                    <Badge variant={TONES[d.response.tone]} className="h-auto rounded-full px-2 py-0.5 font-mono">
                      {d.response.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3 tabular-nums md:px-5">{d.duration}</TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground md:px-5">{d.attempt}</TableCell>
                  <TableCell className="px-4 py-3 text-right md:px-5">
                    {d.retryable && (
                      <form action={redeliver.bind(null, d.id)}>
                        <Button type="submit" variant="outline" className="h-11 rounded-md bg-card px-3 text-[13px] md:h-8" aria-label={`Retry ${d.trigger} delivery from ${d.when}`}>
                          Retry
                        </Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </section>
  );
}
