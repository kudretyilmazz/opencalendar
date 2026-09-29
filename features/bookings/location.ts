import { randomToken } from "@/lib/ids";
import { LOCATION_LABELS, type LocationKind } from "@/features/event-types/schemas";
import type { EventTypeLocationView } from "@/features/event-types/server/service";
import type { ChosenLocation } from "./server/service";

/** What the booking page shows for a location before booking (details only after booking). */
export function publicLocationLabel(loc: EventTypeLocationView): string {
  if (loc.kind === "in_person" && loc.value) return `In person: ${loc.value}`;
  return LOCATION_LABELS[loc.kind];
}

export class LocationChoiceError extends Error {
  constructor(public readonly field: "location" | "phone") {
    super(field);
    this.name = "LocationChoiceError";
  }
}

/**
 * Resolves the booker's choice into what the booking stores (EVT-008, INT-010/011):
 * Jitsi gets a unique room per booking; "you call the invitee" stores the invitee's phone;
 * Meet/Teams/Zoom links are filled in by calendar sync.
 */
export function resolveLocation(
  locations: EventTypeLocationView[],
  choice: { index?: number; phone?: string },
  options: { jitsiBaseUrl: string; eventSlug: string },
): ChosenLocation | null {
  if (!locations.length) return null;
  const index = choice.index ?? 0;
  const loc = locations[index];
  if (!loc) throw new LocationChoiceError("location");
  const kind: LocationKind = loc.kind;
  switch (kind) {
    case "jitsi":
      return { kind, value: `${options.jitsiBaseUrl}/${options.eventSlug.slice(0, 40)}-${randomToken(12)}` };
    case "phone_attendee":
      if (!choice.phone) throw new LocationChoiceError("phone");
      return { kind, value: choice.phone };
    case "google_meet":
    case "ms_teams":
    case "zoom":
      return { kind, value: null };
    default:
      return { kind, value: loc.value };
  }
}

/** Google Maps search link for in-person addresses (INT-011). */
export const mapLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
