import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eventType, eventTypeQuestion, membership, routingFormResponse, team, user } from "@/db/schema";
import type { RoutingAction } from "@/db/schema/routing";
import { routingFormSchema } from "@/features/routing-forms/schemas";
import {
  createForm,
  deleteForm,
  exportResponsesCsv,
  getManagedForm,
  getPublicForm,
  getResponseMessage,
  listForms,
  listResponses,
  RoutingError,
  submitResponse,
  updateForm,
} from "@/features/routing-forms/server/service";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

const msg = (message: string): RoutingAction => ({ kind: "message", message });

/** Sales visitors go to `intro`, everyone else sees a message. */
const formInput = (patch: Record<string, unknown> = {}, eventTypeId = "et-intro") =>
  routingFormSchema.parse({
    name: "Contact",
    fields: [
      { key: "team", label: "Team", type: "select", required: true, options: ["sales", "support"] },
      { key: "company", label: "Company", type: "text", required: false },
      { key: "name", label: "Name", type: "text", required: false },
      { key: "tags", label: "Tags", type: "multi_select", required: false, options: ["a", "b"] },
      { key: "secret", label: "Secret", type: "text", required: false },
    ],
    rules: [{ id: "r-sales", match: "all", conditions: [{ field: "team", operator: "equals", value: ["sales"] }], action: { kind: "event_type", eventTypeId } }],
    fallback: msg("We'll email you"),
    ...patch,
  });

async function expectCode(promise: Promise<unknown>, code: RoutingError["code"]): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: "RoutingError", code });
}

async function seed(): Promise<void> {
  await resetDatabase(db);
  await db.execute(sql`TRUNCATE "team", "event_type", "routing_form" CASCADE`);
  await db.insert(user).values([
    { id: "alice", name: "Alice", email: "alice@example.com", username: "alice", emailVerified: true, timeZone: "UTC" },
    { id: "bob", name: "Bob", email: "bob@example.com", username: "bob", emailVerified: true, timeZone: "UTC" },
    { id: "carol", name: "Carol", email: "carol@example.com", username: "carol", emailVerified: true, timeZone: "UTC" },
  ]);
  await db.insert(eventType).values([
    { id: "et-intro", ownerUserId: "alice", title: "Intro", slug: "intro", durationMinutes: 30 },
    { id: "et-bob", ownerUserId: "bob", title: "Bob's", slug: "bobs", durationMinutes: 30 },
  ]);
  await db.insert(team).values({ id: "t1", name: "Acme", slug: "acme" });
  await db.insert(eventType).values([
    { id: "et-team", ownerUserId: "alice", teamId: "t1", schedulingType: "collective", title: "Team call", slug: "call", durationMinutes: 30 },
    { id: "et-managed", ownerUserId: "alice", teamId: "t1", schedulingType: "managed", title: "Managed", slug: "managed", durationMinutes: 30 },
  ]);
  await db.insert(membership).values([
    { teamId: "t1", userId: "alice", role: "owner" },
    { teamId: "t1", userId: "bob", role: "admin" },
    { teamId: "t1", userId: "carol", role: "member" },
  ]);
  await db.insert(eventTypeQuestion).values([
    { id: "q1", eventTypeId: "et-intro", key: "company", type: "short_text", label: "Company" },
    { id: "q2", eventTypeId: "et-intro", key: "tags", type: "multi_select", label: "Tags", options: ["a", "b"] },
    { id: "q3", eventTypeId: "et-team", key: "company", type: "short_text", label: "Company" },
  ]);
}

beforeEach(seed);

describe("personal routing forms (RTE-001)", () => {
  it("lets the owner create, read, update, list and delete", async () => {
    const id = await createForm(db, "alice", null, formInput());
    expect((await getManagedForm(db, "alice", id)).name).toBe("Contact");
    expect((await listForms(db, "alice")).map((f) => f.id)).toEqual([id]);

    await updateForm(db, "alice", id, formInput({ name: "Renamed", disabled: true }));
    expect(await getManagedForm(db, "alice", id)).toMatchObject({ name: "Renamed", disabled: true });

    await deleteForm(db, "alice", id);
    await expectCode(getManagedForm(db, "alice", id), "NOT_FOUND");
  });

  it("hides the form from other users: read, edit, delete, responses, export and list", async () => {
    const id = await createForm(db, "alice", null, formInput());
    await expectCode(getManagedForm(db, "bob", id), "NOT_FOUND");
    await expectCode(updateForm(db, "bob", id, formInput({ name: "Hacked" })), "NOT_FOUND");
    await expectCode(deleteForm(db, "bob", id), "NOT_FOUND");
    await expectCode(listResponses(db, "bob", id), "NOT_FOUND");
    await expectCode(exportResponsesCsv(db, "bob", id), "NOT_FOUND");
    expect(await listForms(db, "bob")).toEqual([]);
    expect((await getManagedForm(db, "alice", id)).name).toBe("Contact");
  });

  it("reports NOT_FOUND for an unknown form", async () => {
    await expectCode(getManagedForm(db, "alice", "nope"), "NOT_FOUND");
  });

  it("only allows routing to the owner's own personal event types", async () => {
    await expect(createForm(db, "alice", null, formInput({}, "et-bob"))).rejects.toMatchObject({
      code: "INVALID_TARGET",
      fieldErrors: { "rules.0.action.eventTypeId": expect.any(String) },
    });
    await expectCode(createForm(db, "alice", null, formInput({ fallback: { kind: "event_type", eventTypeId: "et-team" } })), "INVALID_TARGET");
    await expectCode(createForm(db, "alice", null, formInput({ fallback: { kind: "event_type", eventTypeId: "missing" } })), "INVALID_TARGET");
  });
});

describe("team routing forms (RTE-001)", () => {
  it("requires admin to create; an admin or owner can", async () => {
    const teamForm = formInput({ rules: [], fallback: { kind: "event_type", eventTypeId: "et-team" } });
    await expectCode(createForm(db, "carol", "t1", teamForm), "NOT_FOUND");
    await expectCode(createForm(db, "nobody-in-team", "t1", teamForm), "NOT_FOUND");
    expect(await createForm(db, "bob", "t1", teamForm)).toEqual(expect.any(String));
    expect(await createForm(db, "alice", "t1", teamForm)).toEqual(expect.any(String));
  });

  it("gives members no access while admins and owners manage every team form", async () => {
    const id = await createForm(db, "bob", "t1", formInput({ rules: [] }));
    await submitResponse(db, id, { team: "sales" });

    await expectCode(getManagedForm(db, "carol", id), "NOT_FOUND");
    await expectCode(updateForm(db, "carol", id, formInput({ rules: [] })), "NOT_FOUND");
    await expectCode(exportResponsesCsv(db, "carol", id), "NOT_FOUND");
    await expectCode(listResponses(db, "carol", id), "NOT_FOUND");
    await expectCode(deleteForm(db, "carol", id), "NOT_FOUND");
    expect(await listForms(db, "carol")).toEqual([]);

    // The creator is not privileged over other admins/owners, and an owner sees admins' forms.
    expect((await listForms(db, "alice")).map((f) => [f.id, f.teamName])).toEqual([[id, "Acme"]]);
    await updateForm(db, "alice", id, formInput({ name: "By owner", rules: [] }));
    expect((await exportResponsesCsv(db, "alice", id)).csv).toContain("sales");
    expect((await listResponses(db, "bob", id)).rows).toHaveLength(1);
  });

  it("only allows the team's non-managed event types", async () => {
    await expect(createForm(db, "bob", "t1", formInput({}, "et-intro"))).rejects.toMatchObject({ code: "INVALID_TARGET" });
    await expectCode(createForm(db, "bob", "t1", formInput({}, "et-managed")), "INVALID_TARGET");
    expect(await createForm(db, "bob", "t1", formInput({}, "et-team"))).toEqual(expect.any(String));
  });

  it("loses access when the admin is demoted", async () => {
    const id = await createForm(db, "bob", "t1", formInput({ rules: [] }));
    await db.update(membership).set({ role: "member" }).where(eq(membership.userId, "bob"));
    await expectCode(getManagedForm(db, "bob", id), "NOT_FOUND");
  });
});

describe("submissions (RTE-002…005)", () => {
  it("stores the trace and matched rule and redirects to the event type with prefill", async () => {
    const id = await createForm(db, "alice", null, formInput());
    const { responseId, target } = await submitResponse(db, id, {
      team: "Sales".toLowerCase(),
      company: "ACME",
      name: "Ada",
      tags: ["a", "b"],
      secret: "s3cret",
      bogus: "x",
    });
    expect(target.kind).toBe("redirect");
    const url = new URL((target as { url: string }).url, "http://x");
    expect(url.pathname).toBe("/alice/intro");
    // Only booking-question keys (and name, which the form declares), plus the routing id.
    expect(Object.fromEntries(url.searchParams)).toEqual({ company: "ACME", tags: "a,b", name: "Ada", routing: responseId });
    expect(url.searchParams.has("secret")).toBe(false);
    expect(url.searchParams.has("team")).toBe(false);

    const [row] = await db.select().from(routingFormResponse).where(eq(routingFormResponse.id, responseId));
    expect(row).toMatchObject({
      formId: id,
      matchedRuleId: "r-sales",
      trace: [{ ruleId: "r-sales", matched: true }],
      action: { kind: "event_type", eventTypeId: "et-intro" },
      answers: { team: "sales", company: "ACME", name: "Ada", tags: ["a", "b"], secret: "s3cret" },
    });
  });

  it("uses the fallback when no rule matches and records it", async () => {
    const id = await createForm(db, "alice", null, formInput());
    const { responseId, target } = await submitResponse(db, id, { team: "support" });
    expect(target).toEqual({ kind: "message", message: "We'll email you" });
    const [row] = await db.select().from(routingFormResponse).where(eq(routingFormResponse.id, responseId));
    expect(row.matchedRuleId).toBeNull();
    expect(row.trace).toEqual([{ ruleId: "r-sales", matched: false }]);
    expect(await getResponseMessage(db, id, responseId)).toBe("We'll email you");
    expect(await getResponseMessage(db, "other-form", responseId)).toBeNull();
  });

  it("routes to external URLs and a team event type with /team/ URLs", async () => {
    const ext = await createForm(db, "alice", null, formInput({ fallback: { kind: "external_url", url: "https://example.com/next" } }));
    expect((await submitResponse(db, ext, { team: "support" })).target).toEqual({ kind: "redirect", url: "https://example.com/next" });

    const teamForm = await createForm(db, "bob", "t1", formInput({}, "et-team"));
    const { target, responseId } = await submitResponse(db, teamForm, { team: "sales", company: "ACME", tags: ["a"] });
    const url = new URL((target as { url: string }).url, "http://x");
    expect(url.pathname).toBe("/team/acme/call");
    expect(Object.fromEntries(url.searchParams)).toEqual({ company: "ACME", routing: responseId });
  });

  it("never lets an answer set booking-page control parameters", async () => {
    await db.insert(eventTypeQuestion).values({ id: "q9", eventTypeId: "et-intro", key: "token", type: "short_text", label: "Token" });
    const id = await createForm(
      db,
      "alice",
      null,
      formInput({
        fields: [
          { key: "team", label: "Team", type: "text", required: false },
          { key: "token", label: "Token", type: "text", required: false },
          { key: "routing", label: "Routing", type: "text", required: false },
        ],
        rules: [],
        fallback: { kind: "event_type", eventTypeId: "et-intro" },
      }),
    );
    const { target, responseId } = await submitResponse(db, id, { team: "x", token: "abc", routing: "forged" });
    const url = new URL((target as { url: string }).url, "http://x");
    expect(url.searchParams.get("routing")).toBe(responseId);
    expect(url.searchParams.has("token")).toBe(false);
  });

  it("shows a message when the target event type was deleted since saving", async () => {
    const id = await createForm(db, "alice", null, formInput());
    await db.delete(eventType).where(eq(eventType.id, "et-intro"));
    const { target } = await submitResponse(db, id, { team: "sales" });
    expect(target.kind).toBe("message");
  });

  it("rejects invalid answers with per-field errors and stores nothing", async () => {
    const id = await createForm(db, "alice", null, formInput());
    await expect(submitResponse(db, id, { team: "marketing" })).rejects.toMatchObject({ code: "INVALID_ANSWERS", fieldErrors: { team: "Pick one of the options" } });
    await expect(submitResponse(db, id, {})).rejects.toMatchObject({ code: "INVALID_ANSWERS", fieldErrors: { team: "This field is required" } });
    expect(await db.select().from(routingFormResponse)).toHaveLength(0);
  });

  it("rejects submissions to disabled and unknown forms", async () => {
    const id = await createForm(db, "alice", null, formInput({ disabled: true }));
    await expectCode(submitResponse(db, id, { team: "sales" }), "NOT_FOUND");
    expect(await getPublicForm(db, id)).toBeNull();
    await expectCode(submitResponse(db, "missing", { team: "sales" }), "NOT_FOUND");
    expect(await db.select().from(routingFormResponse)).toHaveLength(0);

    await updateForm(db, "alice", id, formInput({ disabled: false }));
    expect(await getPublicForm(db, id)).toMatchObject({ id, name: "Contact" });
    await submitResponse(db, id, { team: "sales" });
  });

  it("keeps a response's own trace when the form changes afterwards", async () => {
    const id = await createForm(db, "alice", null, formInput());
    const { responseId } = await submitResponse(db, id, { team: "sales" });
    await updateForm(db, "alice", id, formInput({ rules: [] }));
    const [row] = await db.select().from(routingFormResponse).where(eq(routingFormResponse.id, responseId));
    expect(row.matchedRuleId).toBe("r-sales");
  });
});

describe("CSV export (RTE-005)", () => {
  it("escapes fields, neutralizes formulas and lists newest first", async () => {
    const id = await createForm(db, "alice", null, formInput());
    await submitResponse(db, id, { team: "support", company: '=HYPERLINK("http://evil","x")', name: 'Smith, "Bob"\nJr' });
    await submitResponse(db, id, { team: "sales", company: "+1 555", name: "@me", tags: ["a", "b"] });

    const { csv, filename } = await exportResponsesCsv(db, "alice", id);
    expect(filename).toBe(`routing-responses-${id}.csv`);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("submitted_at,team,company,name,tags,secret,matched_rule,trace,target");
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csv).toContain(`"Smith, ""Bob""\nJr"`);
    expect(csv).toContain("'+1 555");
    expect(csv).toContain("'@me");
    expect(csv).toContain("a; b");
    expect(csv).toContain("fallback");
    expect(csv).toContain("r-sales,r-sales:match,event type et-intro");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("exports only the requested form's responses", async () => {
    const one = await createForm(db, "alice", null, formInput());
    const two = await createForm(db, "alice", null, formInput({ name: "Other" }));
    await submitResponse(db, one, { team: "support", company: "OnlyInOne" });
    await submitResponse(db, two, { team: "support", company: "OnlyInTwo" });
    const csv = (await exportResponsesCsv(db, "alice", one)).csv;
    expect(csv).toContain("OnlyInOne");
    expect(csv).not.toContain("OnlyInTwo");
  });
});
