import { and, count, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { booking, eventType, routingFormResponse } from "@/db/schema";
import type { RoutingAction, RoutingAnswers } from "@/db/schema/routing";
import { referencedEventTypeIds, trendBuckets, trendWindow } from "../overview";
import { type FormListItem, listForms } from "./service";

/**
 * Data for the routing forms overview (RTE-001…005): the forms the user manages, the event type
 * titles they route to, responses per 3-day bucket over the last 30 days and the latest responses
 * across all of them. Everything is scoped through `listForms` (own forms + teams they administer).
 */

export const LATEST_RESPONSES = 5;

export type LatestResponse = {
  id: string;
  formId: string;
  createdAt: Date;
  answers: RoutingAnswers;
  action: RoutingAction;
  /** Title of the event type of a booking made through this response, if any. */
  bookedEventTitle: string | null;
};

export type RoutingOverview = {
  forms: FormListItem[];
  titles: Record<string, string>;
  /** Form id → ten 3-day buckets, oldest first. */
  trend: Record<string, number[]>;
  latest: LatestResponse[];
};

async function eventTypeTitles(db: DbOrTx, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await db.select({ id: eventType.id, title: eventType.title }).from(eventType).where(inArray(eventType.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.title]));
}

async function responseTrend(db: DbOrTx, formIds: string[], now: number): Promise<Record<string, number[]>> {
  const { since, bucketSeconds } = trendWindow(now);
  const bucket = sql<number>`floor(extract(epoch from (${routingFormResponse.createdAt} - ${since.toISOString()}::timestamptz)) / ${bucketSeconds})::int`;
  const rows = await db
    .select({ formId: routingFormResponse.formId, bucket, count: count() })
    .from(routingFormResponse)
    .where(and(inArray(routingFormResponse.formId, formIds), gt(routingFormResponse.createdAt, since), lte(routingFormResponse.createdAt, new Date(now))))
    // By position: the bucket expression's parameters would not compare equal in GROUP BY.
    .groupBy(routingFormResponse.formId, sql`2`);
  return Object.fromEntries(formIds.map((id) => [id, trendBuckets(rows.filter((r) => r.formId === id))]));
}

async function latestResponses(db: DbOrTx, formIds: string[]): Promise<LatestResponse[]> {
  const rows = await db
    .select({
      id: routingFormResponse.id,
      formId: routingFormResponse.formId,
      createdAt: routingFormResponse.createdAt,
      answers: routingFormResponse.answers,
      action: routingFormResponse.action,
    })
    .from(routingFormResponse)
    .where(inArray(routingFormResponse.formId, formIds))
    .orderBy(desc(routingFormResponse.createdAt), desc(routingFormResponse.id))
    .limit(LATEST_RESPONSES);
  if (rows.length === 0) return [];
  const booked = await db
    .select({ responseId: booking.routingFormResponseId, title: eventType.title })
    .from(booking)
    .innerJoin(eventType, eq(eventType.id, booking.eventTypeId))
    .where(
      inArray(
        booking.routingFormResponseId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(desc(booking.createdAt));
  const titleOf = new Map<string, string>();
  for (const b of booked) if (b.responseId && !titleOf.has(b.responseId)) titleOf.set(b.responseId, b.title);
  return rows.map((r) => ({ ...r, bookedEventTitle: titleOf.get(r.id) ?? null }));
}

export async function loadRoutingOverview(db: DbOrTx, userId: string, now: number): Promise<RoutingOverview> {
  const forms = await listForms(db, userId);
  if (forms.length === 0) return { forms, titles: {}, trend: {}, latest: [] };
  const formIds = forms.map((f) => f.id);
  const [titles, trend, latest] = await Promise.all([
    eventTypeTitles(db, referencedEventTypeIds(forms)),
    responseTrend(db, formIds, now),
    latestResponses(db, formIds),
  ]);
  return { forms, titles, trend, latest };
}
