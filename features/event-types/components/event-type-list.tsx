"use client";

import { Clock, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  type BadgeTone,
  EVENT_TYPE_FILTERS,
  type EventTypeFilter,
  type EventTypeListRow,
  filterCounts,
  filterRows,
} from "../list-view";
import { EventTypeRowMenu, EventTypeSwitch } from "./event-type-row-actions";

const BADGE_CLASS: Record<BadgeTone, { variant: "warning" | "outline" | "muted"; className?: string }> = {
  warning: { variant: "warning" },
  outline: { variant: "outline", className: "border-border text-muted-foreground" },
  muted: { variant: "muted" },
};

function FilterBar({
  filter,
  counts,
  onFilter,
  query,
  onQuery,
}: {
  filter: EventTypeFilter;
  counts: Record<EventTypeFilter, number>;
  onFilter: (f: EventTypeFilter) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
      <div
        role="group"
        aria-label="Filter"
        className="grid grid-cols-4 gap-0.5 rounded-[10px] bg-muted p-[3px] md:flex"
      >
        {EVENT_TYPE_FILTERS.map(({ value, label }) => {
          const on = filter === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => onFilter(value)}
              className={cn(
                "flex h-11 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] md:px-3 font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-[34px]",
                on ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label} <span className={cn("tabular-nums", on && "text-muted-foreground")}>{counts[value]}</span>
            </button>
          );
        })}
      </div>
      <div className="relative md:w-[280px]">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Search event types"
          placeholder="Search event types"
          className="h-11 rounded-md border-input bg-card pl-9 text-sm md:h-10 dark:bg-card"
        />
      </div>
    </div>
  );
}

function Row({ row, first, last }: { row: EventTypeListRow; first: boolean; last: boolean }) {
  const off = row.status === "off";
  return (
    <li className="flex flex-col gap-2 px-4 py-4 not-first:border-t not-first:border-border md:grid md:grid-cols-[minmax(0,1fr)_110px_36px_76px] md:items-center md:gap-4 md:px-5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/event-types/${row.id}`}
            className={cn(
              "text-[15px] font-semibold underline-offset-4 hover:underline",
              off ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {row.title}
          </Link>
          {row.badges.map((b) => (
            <Badge
              key={b.label}
              variant={BADGE_CLASS[b.tone].variant}
              className={cn("h-auto rounded-full px-2 py-0.5", BADGE_CLASS[b.tone].className)}
            >
              {b.label}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-muted-foreground">
          <span className="max-w-full truncate font-mono text-xs">/{row.slug}</span>
          <span className="flex items-center gap-1.5">
            <Clock aria-hidden className="size-3.5" />
            {row.durations}
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{row.location}</span>
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 md:contents">
        <div className="flex items-baseline gap-1.5 md:flex-col md:items-end md:gap-0.5">
          <span className="text-sm font-semibold tabular-nums">{row.week.value}</span>
          <span className="text-xs text-muted-foreground">{row.week.label}</span>
        </div>
        <div className="flex items-center gap-2 md:contents">
          <EventTypeSwitch id={row.id} title={row.title} enabled={!off} />
          <EventTypeRowMenu id={row.id} title={row.title} url={row.url} first={first} last={last} />
        </div>
      </div>
    </li>
  );
}

/** The host's event types with a status filter and search (both client-side over the loaded list). */
export function EventTypeList({ rows }: { rows: EventTypeListRow[] }) {
  const [filter, setFilter] = useState<EventTypeFilter>("all");
  const [query, setQuery] = useState("");
  const visible = filterRows(rows, filter, query);
  const position = new Map(rows.map((r, i) => [r.id, i]));

  return (
    <>
      <FilterBar filter={filter} counts={filterCounts(rows)} onFilter={setFilter} query={query} onQuery={setQuery} />
      <Card className="gap-0 overflow-hidden py-0" aria-label="Your event types" role="region">
        {visible.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No event types match.</p>
        ) : (
          <ul>
            {visible.map((row) => {
              const i = position.get(row.id) ?? 0;
              return <Row key={row.id} row={row} first={i === 0} last={i === rows.length - 1} />;
            })}
          </ul>
        )}
        <p className="border-t border-border bg-background px-4 py-3 text-xs text-muted-foreground md:px-5">
          Change the order on your page with Move up and Move down in each event type’s menu. Hidden event types can
          still be booked by their direct link.
        </p>
      </Card>
    </>
  );
}
