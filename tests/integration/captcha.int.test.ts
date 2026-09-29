import { solveChallenge } from "altcha-lib/v1";
import { afterAll, describe, expect, it } from "vitest";
import { newChallenge, pruneCaptchaSolutions, verifyCaptcha } from "@/lib/security/captcha";
import { testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

const SECRET = "c".repeat(32);

async function solve(secret = SECRET) {
  const c = await newChallenge(secret);
  const solution = await solveChallenge(c.challenge, c.salt, c.algorithm, c.maxnumber).promise;
  return { algorithm: c.algorithm, challenge: c.challenge, number: solution!.number, salt: c.salt, signature: c.signature };
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

describe("ALTCHA anti-abuse (ADM-007)", () => {
  it("accepts a solution once, even when re-encoded", async () => {
    const solved = await solve();
    expect(await verifyCaptcha(db, SECRET, encode(solved))).toBe(true);
    expect(await verifyCaptcha(db, SECRET, encode(solved))).toBe(false);
    // Same solution with an extra key / different key order: still the same signature.
    expect(await verifyCaptcha(db, SECRET, encode({ extra: 1, ...solved }))).toBe(false);
  });

  it("rejects missing, forged or foreign solutions", async () => {
    expect(await verifyCaptcha(db, SECRET, undefined)).toBe(false);
    expect(await verifyCaptcha(db, SECRET, "not-base64-json")).toBe(false);
    expect(await verifyCaptcha(db, SECRET, encode(await solve("d".repeat(32))))).toBe(false);
  });

  it("prunes expired solutions", async () => {
    await pruneCaptchaSolutions(db, Date.now() + 3_600_000);
    const solved = await solve();
    expect(await verifyCaptcha(db, SECRET, encode(solved))).toBe(true);
  });
});
