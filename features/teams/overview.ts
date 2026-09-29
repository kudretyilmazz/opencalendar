import { addDays, localDateOf, wallToUtc } from "@/lib/availability/tz";
import type { TeamRole } from "./roles";

/** Pure helpers for the Teams overview page (cards, avatar stacks, the members table). */

/** "Rui Robin" → "RR", "Ada" → "A", "" → "?". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0][0]];
  return letters.join("").toUpperCase();
}

/**
 * Up to `max` avatars: when there are more people than fit, the last slot becomes "+N"
 * (the design shows three faces and "+5" for eight members).
 */
export function avatarStack(names: string[], max = 4): { shown: string[]; extra: number } {
  if (names.length <= max) return { shown: names.map(initials), extra: 0 };
  const shown = names.slice(0, max - 1).map(initials);
  return { shown, extra: names.length - shown.length };
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const ROLE_LABELS: Record<TeamRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };

/** The viewer's calendar day as UTC milliseconds [start, end). */
export function todayWindow(now: number, timeZone: string): { start: number; end: number } {
  const today = localDateOf(now, timeZone);
  return { start: wallToUtc(today, 0, timeZone), end: wallToUtc(addDays(today, 1), 0, timeZone) };
}

/** The first team the viewer can manage, for the members table (owners before admins, by name). */
export function firstManagedTeam<T extends { role: TeamRole }>(teams: T[]): T | null {
  return teams.find((t) => t.role === "owner") ?? teams.find((t) => t.role === "admin") ?? null;
}
