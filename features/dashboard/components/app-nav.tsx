"use client";

import { Calendar, CalendarCheck, Clock, House, Layers, Link as LinkIcon, Route, Settings, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type NavItem = { href: string; label: string; icon: LucideIcon };

const GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/dashboard", label: "Home", icon: House },
      { href: "/bookings", label: "Bookings", icon: CalendarCheck },
      { href: "/event-types", label: "Event types", icon: Layers },
      { href: "/availability", label: "Availability", icon: Clock },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/teams", label: "Teams", icon: Users },
      { href: "/routing-forms", label: "Routing forms", icon: Route },
    ],
  },
  {
    label: "Integrations",
    items: [
      { href: "/settings/calendars", label: "Calendars", icon: Calendar },
      { href: "/settings/webhooks", label: "Webhooks", icon: LinkIcon },
    ],
  },
];

const SETTINGS: NavItem = { href: "/settings/profile", label: "Settings", icon: Settings };

function NavLink({ item, pathname, badge }: { item: NavItem; pathname: string; badge?: number }) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.8} aria-hidden />
      <span className="flex-1 truncate">{item.label}</span>
      {badge ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-highlight px-1.5 text-xs font-semibold text-highlight-foreground">
          {badge}
          <span className="sr-only"> awaiting confirmation</span>
        </span>
      ) : null}
    </Link>
  );
}

/** Grouped main navigation; `pending` puts a count on Bookings. */
export function AppNav({ pending }: { pending: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {GROUPS.map((group) => (
        <div key={group.label ?? "main"} className="flex flex-col gap-0.5">
          {group.label && <p className="mb-1.5 px-3 text-xs font-medium text-muted-foreground">{group.label}</p>}
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} badge={item.href === "/bookings" ? pending : undefined} />
          ))}
        </div>
      ))}
    </nav>
  );
}

export function SettingsNavLink() {
  const pathname = usePathname();
  return <NavLink item={SETTINGS} pathname={pathname} />;
}
