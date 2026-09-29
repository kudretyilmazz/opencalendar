"use client";

import { LogOut, Menu, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label="Sign out"
      className="shrink-0 rounded-md text-muted-foreground hover:text-foreground"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      <LogOut className="size-[18px]" strokeWidth={1.8} aria-hidden />
    </Button>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The resolved theme is unknown during SSR, so the label must not depend on it (hydration).
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label="Toggle dark mode"
      className="rounded-md text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden size-[18px] dark:block" aria-hidden />
      <Moon className="size-[18px] dark:hidden" aria-hidden />
    </Button>
  );
}

/** Applies the theme saved in the user's profile once per session load. */
export function ThemeSync({ theme }: { theme: "system" | "light" | "dark" }) {
  const { setTheme } = useTheme();
  useEffect(() => setTheme(theme), [theme, setTheme]);
  return null;
}

/** Phone-width navigation: the sidebar's content in a sheet, closed again once a link is followed. */
export function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" aria-label="Open menu" className="size-11 rounded-md">
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 bg-card p-0">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Main navigation</SheetDescription>
        <div className="flex h-full flex-col" onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
