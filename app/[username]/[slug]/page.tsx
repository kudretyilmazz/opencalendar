import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { BookingPageView } from "@/features/bookings/components/booking-page";
import { resolveBookingTarget, safeDecode } from "@/features/bookings/server/targets";

async function load(params: PageProps<"/[username]/[slug]">["params"]) {
  const { username, slug } = await params;
  return resolveBookingTarget(getDb(), { username: safeDecode(username), slug });
}

export async function generateMetadata({ params }: PageProps<"/[username]/[slug]">): Promise<Metadata> {
  const target = await load(params);
  // Reschedule and private links carry tokens in the URL: no referrer.
  return { title: target ? `${target.eventType.title} · ${target.displayName}` : "Not found", referrer: "no-referrer" };
}

/** Personal booking page, or a dynamic group's (`/ada+bob/intro`, TEAM-009). */
export default async function BookingPage({ params, searchParams }: PageProps<"/[username]/[slug]">) {
  const target = await load(params);
  if (!target) notFound();
  return <BookingPageView target={target} query={await searchParams} />;
}
