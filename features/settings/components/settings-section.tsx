import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Settings card surface (12px corners, token border). */
export const settingsCardClass = "rounded-[12px] border border-border bg-card";

/**
 * One settings section: a 260px description column beside its card on desktop, stacked on
 * phones. `id` names the heading so the section (and a radio group) can point at it.
 */
export function SettingsSection({
  id,
  title,
  description,
  danger,
  children,
}: {
  id: string;
  title: string;
  description: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid items-start gap-3 md:grid-cols-[260px_minmax(0,1fr)] md:gap-8">
      <div className="flex flex-col gap-1.5 md:pt-1">
        <h2 id={id} className={cn("text-base font-semibold", danger && "text-destructive")}>
          {title}
        </h2>
        <p className="text-[13px] leading-normal text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
