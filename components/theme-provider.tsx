"use client";

import { z } from "zod";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Zod 4 probes for eval support (`Function("")`) the first time it parses; our CSP forbids eval,
// which Firefox reports as an error. Validation works the same without its JIT.
z.config({ jitless: true });

/**
 * Minimal light/dark/system theming. The initial class is applied before hydration by
 * THEME_SCRIPT (an inline script in the root layout's <head>, with the CSP nonce),
 * so this provider never renders a <script> itself (React 19 warns about client-rendered
 * scripts) and there is no flash of the wrong theme.
 */

export type ThemePreference = "system" | "light" | "dark";
const STORAGE_KEY = "theme";

/** Admin-chosen default (ADM-011) for visitors without a stored choice: <html data-default-theme>. */
const instanceDefault = (): ThemePreference => {
  const value = typeof document !== "undefined" ? document.documentElement.dataset.defaultTheme : undefined;
  return value === "light" || value === "dark" ? value : "system";
};

export const THEME_SCRIPT = `(function(){try{var r=document.documentElement;var t=localStorage.getItem("${STORAGE_KEY}")||r.getAttribute("data-default-theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const systemDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

function apply(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [prefersDark, setPrefersDark] = useState(false);

  useEffect(() => {
    let stored: ThemePreference = instanceDefault();
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (value === "light" || value === "dark" || value === "system") stored = value;
    } catch {
      // storage unavailable (private mode): keep "system"
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setPrefersDark(media.matches);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from browser storage */
    setThemeState(stored);
    setPrefersDark(systemDark());
    /* eslint-enable react-hooks/set-state-in-effect */
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: "light" | "dark" = theme === "system" ? (prefersDark ? "dark" : "light") : theme;

  useEffect(() => apply(resolvedTheme), [resolvedTheme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
