import { CalendarCheck, Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { cardClass } from "./side-cards";
import { TimeZoneStep } from "./time-zone-step";

export type SetupStep = { id: "email" | "username" | "timeZone" | "eventType"; done: boolean; description?: string };

const TITLES: Record<SetupStep["id"], string> = {
  email: "Verify your email address",
  username: "Choose a username for your booking page",
  timeZone: "Set your time zone",
  eventType: "Create your first event type",
};

const ACTIONS: Partial<Record<SetupStep["id"], { href: string; label: string }>> = {
  username: { href: "/settings/profile", label: "Choose username" },
  eventType: { href: "/event-types/new", label: "Create event type" },
};

const ctaClass = "h-10 shrink-0 rounded-md px-4 text-sm";
const dotClass = "flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold";

function StepRow({ step, index, current }: { step: SetupStep; index: number; current: boolean }) {
  if (step.done)
    return (
      <li className="flex items-center gap-4 border-t border-border px-4 py-4 md:px-6">
        <span className={cn(dotClass, "bg-success text-success-foreground")}>
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
        </span>
        <span className="flex-1 text-sm font-medium text-muted-foreground line-through">
          <span className="sr-only">Done: </span>
          {TITLES[step.id]}
        </span>
        <span aria-hidden className="text-xs text-success">
          Done
        </span>
      </li>
    );

  const action = ACTIONS[step.id];
  return (
    <li
      aria-current={current ? "step" : undefined}
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border px-4 py-[18px] md:flex-nowrap md:px-6", current && "bg-background")}
    >
      <span className={cn(dotClass, current ? "bg-highlight text-highlight-foreground" : "border border-border text-muted-foreground")}>{index + 1}</span>
      {step.id === "timeZone" ? (
        <TimeZoneStep current={current} buttonClassName={ctaClass} />
      ) : (
        <>
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <span className={cn("text-sm", current ? "font-semibold" : "font-medium")}>{TITLES[step.id]}</span>
            {step.description && <span className="text-[13px] text-muted-foreground">{step.description}</span>}
          </div>
          {action && (
            <Button asChild variant={current ? "default" : "outline"} className={cn(ctaClass, !current && "bg-transparent")}>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          )}
        </>
      )}
    </li>
  );
}

/** First-run checklist with progress; the first open step is highlighted. */
export function SetupCard({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  const currentIndex = steps.findIndex((s) => !s.done);
  return (
    <Card className={cardClass}>
      <div className="flex flex-col gap-3 px-4 py-5 md:px-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Get set up</h2>
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {done} of {steps.length} done
          </span>
        </div>
        <Progress
          value={(done / steps.length) * 100}
          aria-label="Setup progress"
          className="h-1.5 *:data-[slot=progress-indicator]:rounded-full *:data-[slot=progress-indicator]:bg-highlight"
        />
      </div>
      <ol>
        {steps.map((step, i) => (
          <StepRow key={step.id} step={step} index={i} current={i === currentIndex} />
        ))}
      </ol>
    </Card>
  );
}

/** Stands in for the bookings list until the first booking arrives. */
export function EmptyBookings() {
  return (
    <section
      aria-labelledby="no-bookings"
      className="flex flex-col items-center gap-2.5 rounded-[12px] border border-dashed border-border px-6 py-12 text-center"
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CalendarCheck className="size-5" strokeWidth={1.8} aria-hidden />
      </span>
      <h2 id="no-bookings" className="text-[15px] font-semibold">
        No bookings yet
      </h2>
      <p className="max-w-[360px] text-[13px] leading-normal text-muted-foreground">
        When someone books a time, it appears here with everything you need to join.
      </p>
    </section>
  );
}
