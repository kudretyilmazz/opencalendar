import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import { SignOutButton, ThemeSync, ThemeToggle } from "@/features/dashboard/components/shell-controls";
import { hasInvalidCredentials } from "@/features/calendars/server/connections";
import { getProfile } from "@/features/settings/server/service";
import { requireUser } from "@/lib/auth/session";

const NAV: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Home" },
  { href: "/event-types", label: "Event types" },
  { href: "/availability", label: "Availability" },
  { href: "/bookings", label: "Bookings" },
  { href: "/teams", label: "Teams" },
  { href: "/routing-forms", label: "Routing forms" },
  { href: "/settings/calendars", label: "Calendars" },
  { href: "/settings/webhooks", label: "Webhooks" },
  { href: "/settings/profile", label: "Settings" },
];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [profile, brokenCalendars] = await Promise.all([getProfile(getDb(), user.id), hasInvalidCredentials(getDb(), user.id)]);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <ThemeSync theme={profile?.theme ?? "system"} />
      <aside className="flex shrink-0 flex-col gap-4 border-b border-border bg-surface p-4 md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            OpenCalendar
          </Link>
          <ThemeToggle />
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="flex h-9 items-center rounded-md px-3 text-sm hover:bg-accent">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-1 border-t border-border pt-4 md:flex">
          <p className="truncate px-3 text-sm font-medium">{user.name}</p>
          <p className="truncate px-3 text-xs text-muted">{user.email}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex flex-1 flex-col gap-4 p-6 md:p-10">
        {brokenCalendars && (
          <div role="alert" className="max-w-3xl rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            A calendar connection needs attention.{" "}
            <Link href="/settings/calendars" className="font-medium underline">
              Reconnect it
            </Link>{" "}
            so your availability stays accurate.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
