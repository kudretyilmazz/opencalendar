import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { booking, bookingHost, membership, team, webhook } from "@/db/schema";
import { createTeamEventType } from "@/features/teams/server/event-types";
import { loadMemberActivity, loadTeamCards } from "@/features/teams/server/overview";
import { inviteMember, listMyInvitations } from "@/features/teams/server/service";
import { code, form, NOW, world } from "./team-fixtures";
import { testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

const at = (iso: string) => Date.parse(iso);
// NOW is Thu 1 Oct 2026 08:00 UTC; the week runs Mon 28 Sep – Mon 5 Oct.
const WEEK = { start: at("2026-09-28T00:00:00Z"), end: at("2026-10-05T00:00:00Z") };
const TODAY = { start: at("2026-10-01T00:00:00Z"), end: at("2026-10-02T00:00:00Z") };

let teamId = "";
let n = 0;

async function book(eventTypeId: string, hosts: string[], start: string, status: "accepted" | "pending" | "cancelled" = "accepted") {
  const id = `b${++n}`;
  const startAt = new Date(start);
  const endAt = new Date(startAt.getTime() + 30 * 60_000);
  await db.insert(booking).values({
    id,
    uid: `uid-${id}`,
    manageTokenHash: `hash-${id}`,
    icalUid: `ical-${id}`,
    eventTypeId,
    organizerId: hosts[0],
    status,
    title: "Intro",
    startAt,
    endAt,
    timeZone: "UTC",
  });
  await db.insert(bookingHost).values(hosts.map((userId) => ({ bookingId: id, userId, blockedStart: startAt, blockedEnd: endAt })));
}

beforeAll(async () => {
  // "ada" owner, "bob" admin, "cy" and "dee" members of "acme"; "eve" is an outsider.
  teamId = await world(db);
  const intro = await createTeamEventType(db, "ada", teamId, "round_robin", form());
  await createTeamEventType(db, "ada", teamId, "collective", form({ title: "Panel", slug: "panel" }));
  await book(intro, ["cy"], "2026-10-01T09:00:00Z"); // today
  await book(intro, ["cy"], "2026-10-01T15:00:00Z"); // today
  await book(intro, ["dee"], "2026-09-29T10:00:00Z"); // earlier this week
  await book(intro, ["dee"], "2026-10-02T10:00:00Z", "pending"); // counts for the team card only
  await book(intro, ["cy"], "2026-10-01T11:00:00Z", "cancelled"); // counts nowhere
  await book(intro, ["cy"], "2026-10-06T09:00:00Z"); // next week
  await db.insert(webhook).values({ id: "wh1", ownerUserId: "ada", teamId, url: "https://example.com/hook", encryptedSecret: "x", triggers: ["BOOKING_CREATED"] });
  // A second team "eve" owns, with a booking, which must not leak into acme's numbers.
  await db.insert(team).values({ id: "other", name: "Other", slug: "other" });
  await db.insert(membership).values({ teamId: "other", userId: "eve", role: "owner" });
  const otherType = await createTeamEventType(db, "eve", "other", "collective", form({ slug: "other-intro" }));
  await book(otherType, ["eve"], "2026-10-01T09:00:00Z");
});

describe("loadTeamCards", () => {
  it("shows members, event types, this week's active bookings and webhooks per team", async () => {
    const cards = await loadTeamCards(db, "ada", WEEK);
    expect(cards).toEqual([
      {
        id: teamId,
        name: "Acme",
        slug: "acme",
        logoUrl: null,
        role: "owner",
        memberNames: ["Ada", "Bob", "Cy", "Dee"],
        eventTypes: 2,
        weekBookings: 4,
        webhooks: 1,
      },
    ]);
  });

  it("hides the webhook count from plain members", async () => {
    const [card] = await loadTeamCards(db, "cy", WEEK);
    expect(card).toMatchObject({ role: "member", webhooks: null, weekBookings: 4 });
  });

  it("only returns the viewer's own teams", async () => {
    expect((await loadTeamCards(db, "eve", WEEK)).map((c) => [c.name, c.weekBookings])).toEqual([["Other", 1]]);
  });
});

describe("loadMemberActivity", () => {
  it("counts each member's accepted bookings today and this week", async () => {
    const rows = await loadMemberActivity(db, "bob", teamId, { today: TODAY, week: WEEK });
    expect(rows.map((r) => [r.name, r.role, r.today, r.week])).toEqual([
      ["Ada", "owner", 0, 0],
      ["Bob", "admin", 0, 0],
      ["Cy", "member", 2, 2],
      ["Dee", "member", 0, 1],
    ]);
    expect(rows[2].email).toBe("cy@example.com");
  });

  it("is for admins and owners only; outsiders get NOT_FOUND", async () => {
    expect(await code(loadMemberActivity(db, "cy", teamId, { today: TODAY, week: WEEK }))).toBe("FORBIDDEN");
    expect(await code(loadMemberActivity(db, "eve", teamId, { today: TODAY, week: WEEK }))).toBe("NOT_FOUND");
  });
});

describe("listMyInvitations", () => {
  it("includes who sent the invitation", async () => {
    await inviteMember(db, "ada", teamId, { email: "zed@example.com", role: "member" }, NOW);
    const invitations = await listMyInvitations(db, { id: "zed", email: "zed@example.com", emailVerified: true }, NOW);
    expect(invitations).toMatchObject([{ teamName: "Acme", role: "member", inviterName: "Ada" }]);
  });
});
