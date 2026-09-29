import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { user } from "@/db/schema";
import { getProfile, updateProfile } from "@/features/settings/server/service";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(async () => {
  await resetDatabase(db);
  await db.insert(user).values([
    { id: "u1", name: "Ada", email: "ada@example.com", username: "ada" },
    { id: "u2", name: "Grace", email: "grace@example.com" },
  ]);
});

const input = {
  name: "Grace Hopper",
  username: "grace",
  timeZone: "America/New_York",
  locale: "en" as const,
  weekStart: 0 as const,
  timeFormat: 12 as const,
  theme: "light" as const,
  allowDynamicGroup: false,
};

describe("profile settings service (ADM-005)", () => {
  it("returns defaults for a user without saved profile settings", async () => {
    const profile = await getProfile(db, "u2");
    expect(profile).toMatchObject({ name: "Grace", username: null, timeZone: "UTC", theme: "system" });
  });

  it("updates only the given user's row", async () => {
    expect(await updateProfile(db, "u2", input)).toEqual({ ok: true });
    expect(await getProfile(db, "u2")).toMatchObject(input);
    expect(await getProfile(db, "u1")).toMatchObject({ name: "Ada", username: "ada", timeZone: "UTC" });
  });

  it("is idempotent for repeated saves", async () => {
    await updateProfile(db, "u2", input);
    expect(await updateProfile(db, "u2", { ...input, theme: "dark" })).toEqual({ ok: true });
    expect((await getProfile(db, "u2"))?.theme).toBe("dark");
  });

  it("reports a taken username without changing anything", async () => {
    const result = await updateProfile(db, "u2", { ...input, username: "ada" });
    expect(result).toEqual({ ok: false, error: "USERNAME_TAKEN" });
    expect((await getProfile(db, "u2"))?.name).toBe("Grace");
  });

  it("treats usernames case-insensitively", async () => {
    await db.update(user).set({ username: "Ada" }).where(eq(user.id, "u1"));
    expect(await updateProfile(db, "u2", { ...input, username: "ada" })).toEqual({ ok: false, error: "USERNAME_TAKEN" });
  });

  it("returns null for an unknown user", async () => {
    expect(await getProfile(db, "missing")).toBeNull();
  });
});
