import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { BookingPageView } from "@/features/bookings/components/booking-page";
import { resolveBookingTarget } from "@/features/bookings/server/targets";

async function load(params: PageProps<"/team/[team]/[slug]">["params"]) {
  const { team, slug } = await params;
  return resolveBookingTarget(getDb(), { team, slug });
}

export async function generateMetadata({ params }: PageProps<"/team/[team]/[slug]">): Promise<Metadata> {
  const target = await load(params);
  return { title: target ? `${target.eventType.title} · ${target.displayName}` : "Not found", referrer: "no-referrer" };
}

/** A team's collective or round-robin booking page (TEAM-001/004/005). */
export default async function TeamBookingPage({ params, searchParams }: PageProps<"/team/[team]/[slug]">) {
  const target = await load(params);
  if (!target) notFound();
  return <BookingPageView target={target} query={await searchParams} />;
}
