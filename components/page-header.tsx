import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The heading row every dashboard page opens with: a 28px title, a one-line description and
 * the page's actions on the right (they wrap under the title on narrow screens).
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4 md:gap-6", className)}>
      {/* Grows and wraps its text first; the actions drop below only when under ~20rem is left. */}
      <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-1 md:gap-1.5">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] md:text-[28px] md:leading-9">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Width and rhythm shared by dashboard pages (matches the home page). */
export const PAGE_CLASS = "flex w-full max-w-[1104px] flex-col gap-5 md:gap-6";

/** Buttons in a page header: 40px tall, 8px corners (the design's large button). */
export const HEADER_BUTTON_CLASS = "h-10 rounded-md px-3.5 text-sm";
