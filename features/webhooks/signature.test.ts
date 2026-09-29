import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeSignature, parseSignatureHeader, signatureHeader, verifySignature } from "./signature";

const secret = "whsec_test";
const body = JSON.stringify({ version: 1, trigger: "PING" });
const t = 1_791_201_603;

describe("webhook signatures (API-002)", () => {
  it("signs `${timestamp}.${body}` with HMAC-SHA256", () => {
    const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    expect(computeSignature(secret, t, body)).toBe(expected);
    expect(signatureHeader(secret, t, body)).toBe(`t=${t},v1=${expected}`);
  });

  it("verifies a fresh signature", () => {
    expect(verifySignature({ secret, body, header: signatureHeader(secret, t, body), nowSeconds: t + 10 })).toBe(true);
  });

  it("rejects a tampered body, a wrong secret and a stale timestamp", () => {
    const header = signatureHeader(secret, t, body);
    expect(verifySignature({ secret, body: `${body} `, header, nowSeconds: t })).toBe(false);
    expect(verifySignature({ secret: "other", body, header, nowSeconds: t })).toBe(false);
    expect(verifySignature({ secret, body, header, nowSeconds: t + 301 })).toBe(false);
    expect(verifySignature({ secret, body, header, nowSeconds: t - 301 })).toBe(false);
    expect(verifySignature({ secret, body, header, nowSeconds: t + 1000, toleranceSeconds: 1000 })).toBe(true);
  });

  it("accepts any of several v1 signatures (secret rotation)", () => {
    const header = `t=${t},v1=${computeSignature("old", t, body)},v1=${computeSignature(secret, t, body)}`;
    expect(verifySignature({ secret, body, header, nowSeconds: t })).toBe(true);
  });

  it("rejects malformed headers", () => {
    for (const header of [null, undefined, "", "t=abc,v1=00", `t=${t}`, `v1=${"a".repeat(64)}`, `t=${t},v1=zz`, "x".repeat(2000)]) {
      expect(parseSignatureHeader(header)).toBeNull();
      expect(verifySignature({ secret, body, header, nowSeconds: t })).toBe(false);
    }
  });
});
