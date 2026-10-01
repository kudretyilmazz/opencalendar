import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { instanceSettings, user } from "@/db/schema";
import { DEFAULT_SETTINGS } from "@/features/instance/defaults";
import {
  deleteAsset,
  getAsset,
  getInstanceSettings,
  loadInstanceSettings,
  putAsset,
  updateInstanceSettings,
} from "@/features/instance/server/service";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(async () => {
  await resetDatabase(db);
  await db.insert(user).values({ id: "admin", name: "Ada", email: "ada@example.com", role: "admin" });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe("instance settings (ADM-011)", () => {
  it("returns the built-in defaults on a fresh instance", async () => {
    expect(await loadInstanceSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it("upserts the single row and merges partial saves", async () => {
    await updateInstanceSettings(db, { appName: "Acme Meet", hidePoweredBy: true }, "admin");
    await updateInstanceSettings(db, { theme: { light: { primary: "#1d4ed8" } }, radius: "1rem" }, "admin");
    const settings = await loadInstanceSettings(db);
    expect(settings).toMatchObject({ appName: "Acme Meet", hidePoweredBy: true, theme: { light: { primary: "#1d4ed8" } }, radius: "1rem" });
    const rows = await db.select().from(instanceSettings);
    expect(rows).toHaveLength(1);
    expect(rows[0].updatedBy).toBe("admin");
  });

  it("falls back to the default again when a field is cleared", async () => {
    await updateInstanceSettings(db, { landingHeadline: "Book us" }, "admin");
    await updateInstanceSettings(db, { landingHeadline: null }, "admin");
    expect((await loadInstanceSettings(db)).landingHeadline).toBe(DEFAULT_SETTINGS.landingHeadline);
  });

  it("allows only one settings row", async () => {
    await expect(db.execute(sql`INSERT INTO instance_settings (id) VALUES (2)`)).rejects.toThrow();
  });

  it("keeps the row when the admin who saved it is deleted", async () => {
    await updateInstanceSettings(db, { appName: "Acme Meet" }, "admin");
    await db.delete(user);
    expect((await loadInstanceSettings(db)).appName).toBe("Acme Meet");
  });

  it("reflects saves in the cached reader at once", async () => {
    await getInstanceSettings(db);
    await updateInstanceSettings(db, { appName: "Cached Co" }, "admin");
    expect((await getInstanceSettings(db)).appName).toBe("Cached Co");
  });
});

describe("instance assets", () => {
  it("stores bytes, exposes their hash in the settings and deletes them", async () => {
    const sha = await putAsset(db, "favicon", PNG, "image/png");
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    const asset = await getAsset(db, "favicon");
    expect(asset?.mimeType).toBe("image/png");
    expect(new Uint8Array(asset!.bytes)).toEqual(PNG);
    expect((await loadInstanceSettings(db)).assets.favicon).toEqual({ sha256: sha, mimeType: "image/png" });

    await deleteAsset(db, "favicon");
    expect(await getAsset(db, "favicon")).toBeNull();
    expect((await loadInstanceSettings(db)).assets).toEqual({});
  });

  it("replaces an existing asset of the same kind", async () => {
    await putAsset(db, "logo", PNG, "image/png");
    const svg = new TextEncoder().encode("<svg/>");
    await putAsset(db, "logo", svg, "image/svg+xml");
    expect((await getAsset(db, "logo"))?.mimeType).toBe("image/svg+xml");
  });
});
