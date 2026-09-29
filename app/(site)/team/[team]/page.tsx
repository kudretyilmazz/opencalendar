import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { EventTypeList } from "@/features/bookings/components/event-type-list";
import { findPublicTeam, listPublicTeamEventTypes } from "@/features/teams/server/event-types";

export async function generateMetadata({ params }: PageProps<"/team/[team]">): Promise<Metadata> {
  const team = await findPublicTeam(getDb(), (await params).team);
  return { title: team ? team.name : "Not found" };
}

/** Public team page listing its bookable event types (TEAM-001). */
export default async function TeamPage({ params }: PageProps<"/team/[team]">) {
  const db = getDb();
  const team = await findPublicTeam(db, (await params).team);
  if (!team) notFound();
  const eventTypes = await listPublicTeamEventTypes(db, team.id);
  return <EventTypeList heading={team.name} logoUrl={team.logoUrl} basePath={`/team/${team.slug}`} eventTypes={eventTypes} />;
}
