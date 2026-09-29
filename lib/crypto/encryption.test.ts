import { describe, expect, it } from "vitest";
import { createCipher, DecryptionError } from "./encryption";

const keyA = Buffer.alloc(32, 7).toString("base64");
const keyB = Buffer.alloc(32, 9).toString("base64");

describe("createCipher", () => {
  it("round-trips a value", () => {
    const cipher = createCipher({ current: keyA });
    const encrypted = cipher.encrypt("s3cret-token");
    expect(encrypted).not.toContain("s3cret-token");
    expect(cipher.decrypt(encrypted)).toBe("s3cret-token");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const cipher = createCipher({ current: keyA });
    expect(cipher.encrypt("x")).not.toBe(cipher.encrypt("x"));
  });

  it("prefixes ciphertext with a version tag", () => {
    expect(createCipher({ current: keyA }).encrypt("x").startsWith("v1:")).toBe(true);
  });

  it("detects tampering", () => {
    const cipher = createCipher({ current: keyA });
    const [v, iv, tag, data] = cipher.encrypt("hello").split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 0xff;
    expect(() => cipher.decrypt([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow(
      DecryptionError,
    );
  });

  it("decrypts values written with the previous key during rotation", () => {
    const old = createCipher({ current: keyA });
    const encrypted = old.encrypt("legacy");
    const rotated = createCipher({ current: keyB, previous: keyA });
    expect(rotated.decrypt(encrypted)).toBe("legacy");
    expect(rotated.needsReencryption(encrypted)).toBe(true);
    expect(rotated.needsReencryption(rotated.encrypt("fresh"))).toBe(false);
  });

  it("fails with the wrong key", () => {
    const encrypted = createCipher({ current: keyA }).encrypt("x");
    expect(() => createCipher({ current: keyB }).decrypt(encrypted)).toThrow(DecryptionError);
  });

  it("rejects malformed input", () => {
    expect(() => createCipher({ current: keyA }).decrypt("garbage")).toThrow(DecryptionError);
  });

  it("binds ciphertext to associated data (e.g. the row id)", () => {
    const cipher = createCipher({ current: keyA });
    const sealed = cipher.encrypt("token", "credential-1");
    expect(cipher.decrypt(sealed, "credential-1")).toBe("token");
    expect(() => cipher.decrypt(sealed, "credential-2")).toThrow(DecryptionError);
    expect(() => cipher.decrypt(sealed)).toThrow(DecryptionError);
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => createCipher({ current: Buffer.alloc(8).toString("base64") })).toThrow();
  });
});
