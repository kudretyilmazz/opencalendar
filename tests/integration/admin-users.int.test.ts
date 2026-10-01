import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { session, user } from "@/db/schema";
import { listUsers, prepareUserDeletion, setUserDisabled, setUserRole, userCounts } from "@/features/admin-users/server/service";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

const day = (n: number) => new Date(Date.UTC(2030, 0, n));

beforeEach(async () => {
  await resetDatabase(db);
  await db.insert(user).values([
    { id: "a1", name: "Ada Admin", email: "ada@example.com", role: "admin", createdAt: day(1) },
    { id: "a2", name: "Alan Admin", email: "alan@example.com", role: "admin", createdAt: day(2) },
    { id: "u1", name: "Grace", email: "grace@example.com", username: "grace", createdAt: day(3) },
    { id: "u2", name: "Linus", email: "linus_t@example.com", createdAt: day(4), disabledAt: day(5) },
  ]);
  await db.insert(session).values([
    { id: "s1", userId: "u1", token: "t1", expiresAt: day(30), updatedAt: day(6) },
    { id: "s2", userId: "u1", token: "t2", expiresAt: day(30), updatedAt: day(8) },
    { id: "s3", userId: "a2", token: "t3", expiresAt: day(30) },
  ]);
});

const roleOf = async (id: string) => (await db.select({ role: user.role }).from(user).where(eq(user.id, id)))[0]?.role;
const sessionsOf = async (id: string) => (await db.select().from(session).where(eq(session.userId, id))).length;

describe("listUsers (ADM-009)", () => {
  it("lists newest first with the latest session activity", async () => {
    const { rows, total } = await listUsers(db, {});
    expect(total).toBe(4);
    expect(rows.map((r) => r.id)).toEqual(["u2", "u1", "a2", "a1"]);
    expect(rows.find((r) => r.id === "u1")?.lastSeenAt).toEqual(day(8));
    expect(rows.find((r) => r.id === "a1")?.lastSeenAt).toBeNull();
  });

  it("searches name, email and username case-insensitively, treating wildcards literally", async () => {
    expect((await listUsers(db, { query: "GRACE" })).rows.map((r) => r.id)).toEqual(["u1"]);
    expect((await listUsers(db, { query: "admin" })).total).toBe(2);
    expect((await listUsers(db, { query: "s_t" })).rows.map((r) => r.id)).toEqual(["u2"]);
    expect((await listUsers(db, { query: "%" })).total).toBe(0);
  });

  it("filters by role and status", async () => {
    expect((await listUsers(db, { role: "admin" })).total).toBe(2);
    expect((await listUsers(db, { status: "disabled" })).rows.map((r) => r.id)).toEqual(["u2"]);
    expect((await listUsers(db, { status: "active", role: "user" })).rows.map((r) => r.id)).toEqual(["u1"]);
  });

  it("counts accounts, active admins and disabled accounts", async () => {
    expect(await userCounts(db)).toEqual({ total: 4, admins: 2, disabled: 1 });
  });
});

describe("admin account actions (ADM-009)", () => {
  it("promotes and demotes, signing the account out", async () => {
    expect(await setUserRole(db, "a1", "u1", "admin")).toEqual({ allowed: true });
    expect(await roleOf("u1")).toBe("admin");
    expect(await sessionsOf("u1")).toBe(0);
    expect(await setUserRole(db, "a1", "u1", "user")).toEqual({ allowed: true });
    expect(await roleOf("u1")).toBe("user");
  });

  it("disables (ending sessions) and re-enables accounts", async () => {
    expect(await setUserDisabled(db, "a1", "u1", true, day(9))).toEqual({ allowed: true });
    expect((await db.select().from(user).where(eq(user.id, "u1")))[0].disabledAt).toEqual(day(9));
    expect(await sessionsOf("u1")).toBe(0);
    await setUserDisabled(db, "a1", "u1", false);
    expect((await db.select().from(user).where(eq(user.id, "u1")))[0].disabledAt).toBeNull();
  });

  it("refuses self-demotion and removing the last active admin", async () => {
    expect(await setUserRole(db, "a1", "a1", "user")).toEqual({ allowed: false, reason: "SELF" });
    expect(await setUserRole(db, "a1", "a2", "user")).toEqual({ allowed: true });
    expect(await setUserDisabled(db, "u1", "a1", true)).toEqual({ allowed: false, reason: "LAST_ADMIN" });
    expect(await roleOf("a1")).toBe("admin");
  });

  it("lets only one of two admins demoting each other at once succeed", async () => {
    const results = await Promise.all([setUserRole(db, "a1", "a2", "user"), setUserRole(db, "a2", "a1", "user")]);
    expect(results.filter((r) => r.allowed)).toHaveLength(1);
    expect(await userCounts(db)).toMatchObject({ admins: 1 });
  });

  it("prepares a deletion by removing admin rights and access first", async () => {
    expect(await prepareUserDeletion(db, "a1", "a2", day(9))).toEqual({ allowed: true });
    const [row] = await db.select().from(user).where(eq(user.id, "a2"));
    expect(row).toMatchObject({ role: "user", disabledAt: day(9) });
    expect(await sessionsOf("a2")).toBe(0);
  });

  it("reports unknown accounts", async () => {
    expect(await setUserDisabled(db, "a1", "nobody", true)).toEqual({ allowed: false, reason: "NOT_FOUND" });
  });
});
