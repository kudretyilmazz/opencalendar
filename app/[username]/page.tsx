import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { EventTypeList } from "@/features/bookings/components/event-type-list";
import { groupUsernames, resolveBookingTarget, safeDecode } from "@/features/bookings/server/targets";
import { findPublicHost, listPublicEventTypes } from "@/features/event-types/server/service";

type Loaded = { heading: string; basePath: string; eventTypes: Awaited<ReturnType<typeof listPublicEventTypes>> };

/**
 * A person's profile (BKG-001), or a dynamic group (`/ada+bob`, TEAM-009) listing the first
 * person's event types that a group can book together.
 */
async function load(raw: string): Promise<Loaded | null> {
  const db = getDb();
  const value = safeDecode(raw);
  const group = groupUsernames(value);
  const host = await findPublicHost(db, group ? group[0] : value);
  if (!host) return null;
  const eventTypes = await listPublicEventTypes(db, host.id);
  if (!group) return { heading: host.name, basePath: `/${host.username}`, eventTypes };
  const bookable = await Promise.all(eventTypes.map((et) => resolveBookingTarget(db, { username: value, slug: et.slug })));
  const targets = bookable.filter((t) => t !== null);
  if (!targets.length) return null;
  return { heading: targets[0].displayName, basePath: targets[0].basePath, eventTypes: targets.map((t) => t.eventType) };
}

export async function generateMetadata({ params }: PageProps<"/[username]">): Promise<Metadata> {
  const found = await load((await params).username);
  return { title: found ? found.heading : "Not found" };
}

export default async function ProfilePage({ params }: PageProps<"/[username]">) {
  const found = await load((await params).username);
  if (!found) notFound();
  return <EventTypeList heading={found.heading} basePath={found.basePath} eventTypes={found.eventTypes} />;
}
