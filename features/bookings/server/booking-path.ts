import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { eventType, team, user } from "@/db/schema";

/**
 * Public booking page of an event type, for "book again" links: `/team/{team}/{slug}` for team
 * event types (TEAM-001), `/{organizer}/{slug}` otherwise. Null when there is no public page.
 */
export async function bookingPagePath(db: DbOrTx, eventTypeId: string, organizerId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: eventType.slug, teamSlug: team.slug, username: user.username })
    .from(eventType)
    .leftJoin(team, eq(team.id, eventType.teamId))
    .leftJoin(user, eq(user.id, organizerId))
    .where(eq(eventType.id, eventTypeId));
  if (!row) return null;
  if (row.teamSlug) return `/team/${row.teamSlug}/${row.slug}`;
  return row.username ? `/${row.username}/${row.slug}` : null;
}
