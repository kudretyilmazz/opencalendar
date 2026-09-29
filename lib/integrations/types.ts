import type { z } from "zod";
import type { Env } from "@/lib/env";

/** Adapter contracts (INT-001, docs/03-architecture/integrations.md). Core code only uses these. */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ProviderContext<C> {
  credential: C;
  fetch: FetchLike;
  /** Persists a refreshed credential (OAuth token rotation). */
  saveCredential(next: C): Promise<void>;
}

export interface ExternalCalendar {
  externalId: string;
  name: string;
  color?: string;
  readOnly: boolean;
  primary?: boolean;
}

/** Epoch ms, half-open. `externalEventId` lets us ignore events we created ourselves. */
export interface BusyInterval {
  start: number;
  end: number;
  externalEventId?: string;
}

export interface CalendarEventInput {
  /** Booking iCal UID: used for idempotent creates where the provider supports it. */
  uid: string;
  title: string;
  description: string;
  start: number;
  end: number;
  timeZone: string;
  organizer: { name: string; email: string };
  attendees: { name: string; email: string }[];
  location?: string;
  conference?: "google_meet" | "ms_teams";
}

export interface CreatedEvent {
  externalId: string;
  meetingUrl?: string;
}

export interface CalendarAdapter<C> {
  listCalendars(ctx: ProviderContext<C>): Promise<ExternalCalendar[]>;
  /** `timeZone` (the host's) is used for floating and all-day values. */
  getBusy(
    ctx: ProviderContext<C>,
    calendarIds: string[],
    range: { start: number; end: number; timeZone: string },
  ): Promise<Record<string, BusyInterval[]>>;
  createEvent?(ctx: ProviderContext<C>, calendarId: string, event: CalendarEventInput): Promise<CreatedEvent>;
  updateEvent?(ctx: ProviderContext<C>, calendarId: string, externalId: string, event: CalendarEventInput): Promise<CreatedEvent>;
  deleteEvent?(ctx: ProviderContext<C>, calendarId: string, externalId: string): Promise<void>;
}

export interface MeetingInput {
  uid: string;
  title: string;
  start: number;
  end: number;
}

export interface ConferencingAdapter<C> {
  createMeeting(ctx: ProviderContext<C>, meeting: MeetingInput): Promise<{ meetingId: string; url: string }>;
  updateMeeting(ctx: ProviderContext<C>, meetingId: string, meeting: MeetingInput): Promise<void>;
  deleteMeeting(ctx: ProviderContext<C>, meetingId: string): Promise<void>;
}

export interface CheckoutInput {
  bookingUid: string;
  /** Minor units (cents). */
  amount: number;
  /** ISO 4217, e.g. "EUR". */
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export type PaymentEvent =
  | { type: "paid"; externalId: string; bookingUid: string; amount: number; currency: string }
  | { type: "failed" | "expired"; externalId: string; bookingUid: string }
  | { type: "refunded"; externalId: string; amount: number };

/**
 * Payment providers (INT-001). The interface is part of the adapter framework now so core code
 * never talks to a payment API directly; the first implementation (Stripe, PAY-001…005) is M5.
 */
export interface PaymentAdapter<C> {
  createCheckout(ctx: ProviderContext<C>, input: CheckoutInput): Promise<{ redirectUrl: string; externalId: string; expiresAt: number }>;
  /** Verifies the provider's signature; null for events that don't concern OpenCalendar. */
  parseWebhook(request: Request, secret: string): Promise<PaymentEvent | null>;
  refund(ctx: ProviderContext<C>, externalId: string, amount?: number): Promise<void>;
}

export type OAuthConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Extra authorize params, e.g. Google's access_type=offline. */
  authorizeParams?: Record<string, string>;
  /** "body" (client_id/secret in the form) or "basic" (HTTP Basic, e.g. Zoom). */
  clientAuth: "body" | "basic";
  /** Fetches the account label (email) after the token exchange. */
  accountLabel(fetch: FetchLike, accessToken: string): Promise<string>;
};

export type OAuthCredential = {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt: number;
  scope?: string;
};

export type ProviderId = "google" | "microsoft" | "caldav" | "ics_feed" | "zoom";

export interface ProviderDefinition<C = unknown> {
  id: ProviderId;
  name: string;
  auth: "oauth2" | "caldav" | "ics_url";
  oauth?: OAuthConfig;
  /** Env holding the OAuth client, or null when the provider is not configured (INT-013). */
  client?(env: Env): { clientId: string; clientSecret: string } | null;
  /** Admin hint shown when the provider is not configured. */
  configureHint?: string;
  credentialSchema: z.ZodType<C>;
  calendar?: CalendarAdapter<C>;
  conferencing?: ConferencingAdapter<C>;
  payment?: PaymentAdapter<C>;
}
