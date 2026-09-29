import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/** A titled card in the dashboard design language (18/20px padding, 16px semibold heading). */
export function SectionCard({
  title,
  description,
  actions,
  children,
  id,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <Card id={id} className={cn("scroll-mt-6 gap-4 px-4 py-4 md:px-5 md:py-[18px]", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </Card>
  );
}
