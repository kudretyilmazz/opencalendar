import { Calendar } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SourceFooter } from "@/components/source-footer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getDb } from "@/db/client";
import { AppNav, SettingsNavLink } from "@/features/dashboard/components/app-nav";
import { MobileNav, SignOutButton, ThemeSync, ThemeToggle } from "@/features/dashboard/components/shell-controls";
import { countPending } from "@/features/dashboard/server/overview";
import { hasInvalidCredentials } from "@/features/calendars/server/connections";
import { getProfile } from "@/features/settings/server/service";
import { requireUser } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { requestTime } from "@/lib/clock";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0]?.[0] ?? "?"];
  return letters.join("").toUpperCase();
}

function Logo() {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2.5 rounded-md text-[15px] font-semibold tracking-[-0.01em]"
    >
      <span className="flex size-[30px] items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Calendar className="size-4" aria-hidden />
      </span>
      OpenCalendar
    </Link>
  );
}

function SidebarContent({
  user,
  pending,
  inSheet = false,
}: {
  user: { name: string; email: string };
  pending: number;
  inSheet?: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-6 py-5">
      {/* In the mobile sheet, leave room for its close button at the top right. */}
      <div className={cn("flex shrink-0 items-center justify-between pr-4 pl-5", inSheet && "pr-14")}>
        <Logo />
        <ThemeToggle />
      </div>
      {/* Logo and account stay put; on a short screen only the links scroll. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto px-4">
        <AppNav pending={pending} />
      </div>
      <div className="flex shrink-0 flex-col gap-0.5 px-4">
        <SettingsNavLink />
        <div className="mt-2.5 flex items-center gap-2.5 border-t border-border pt-3 pr-0 pl-3">
          <span
            aria-hidden
            className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-semibold"
          >
            {initials(user.name)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const db = getDb();
  const [profile, brokenCalendars, pending] = await Promise.all([
    getProfile(db, user.id),
    hasInvalidCredentials(db, user.id),
    countPending(db, user.id, requestTime()),
  ]);
  const person = { name: user.name, email: user.email };

  return (
    // App shell: one screen tall; the sidebar (or the phone header) stays put and only <main> scrolls.
    <div className="relative flex h-svh flex-col overflow-hidden md:flex-row">
      <ThemeSync theme={profile?.theme ?? "system"} />
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-card pr-2 pl-4 md:hidden">
        <Logo />
        <MobileNav>
          <SidebarContent user={person} pending={pending} inSheet />
        </MobileNav>
      </header>
      <aside className="relative hidden w-64 shrink-0 overflow-hidden border-r border-border bg-card md:block">
        <SidebarContent user={person} pending={pending} />
      </aside>
      {/* `relative` makes this scroller the containing block of absolutely positioned descendants
          (Radix renders its hidden form inputs that way); otherwise they escape the scroll box,
          stretch the document and the whole window scrolls past the shell. */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <main className="flex flex-1 flex-col gap-4 px-4 py-5 md:px-12 md:py-10">
          {brokenCalendars && (
            <Alert variant="destructive" className="max-w-3xl border-destructive/40 bg-destructive/10">
              <AlertDescription>
                A calendar connection needs attention.{" "}
                <Link href="/settings/calendars" className="font-medium">
                  Reconnect it
                </Link>{" "}
                so your availability stays accurate.
              </AlertDescription>
            </Alert>
          )}
          {children}
        </main>
        <SourceFooter />
      </div>
    </div>
  );
}
