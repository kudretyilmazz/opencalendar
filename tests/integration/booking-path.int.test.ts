import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { user } from "@/db/schema";
import { bookingPagePath } from "@/features/bookings/server/booking-path";
import { createEventType } from "@/features/event-types/server/service";
import { createTeamEventType } from "@/features/teams/server/event-types";
import { testDatabase } from "./helpers";
import { form, world } from "./team-fixtures";

const { db, close } = testDatabase();
afterAll(close);
let teamId: string;
beforeEach(async () => {
  teamId = await world(db);
});

/** Links back to the booking page (reschedule, "book again", BKG-009) must match where it's published. */
describe("bookingPagePath", () => {
  it("uses the team's URL for team event types, whoever the organizer is", async () => {
    const collective = await createTeamEventType(db, "ada", teamId, "collective", form({ slug: "bilgi-alin" }));
    const roundRobin = await createTeamEventType(db, "ada", teamId, "round_robin", form({ slug: "demo" }));
    expect(await bookingPagePath(db, collective, "cy")).toBe("/team/acme/bilgi-alin");
    expect(await bookingPagePath(db, roundRobin, "dee")).toBe("/team/acme/demo");
  });

  it("uses the organizer's URL for personal event types", async () => {
    const personal = await createEventType(db, "cy", form({ slug: "intro" }));
    expect(await bookingPagePath(db, personal, "cy")).toBe("/cy/intro");
  });

  it("has no page for a personal event type whose owner has no username", async () => {
    const personal = await createEventType(db, "dee", form({ slug: "intro" }));
    await db.update(user).set({ username: null }).where(eq(user.id, "dee"));
    expect(await bookingPagePath(db, personal, "dee")).toBeNull();
  });

  it("has no page for an event type that no longer exists", async () => {
    expect(await bookingPagePath(db, "missing", "cy")).toBeNull();
  });
});
