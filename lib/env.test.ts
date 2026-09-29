import { describe, expect, it } from "vitest";
import { EnvValidationError, getEnv, parseEnv, resetEnvCache } from "./env";

const KEY = Buffer.alloc(32, 1).toString("base64");

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  APP_URL: "http://localhost:3000",
  AUTH_SECRET: "a".repeat(32),
  ENCRYPTION_KEY: KEY,
  SMTP_HOST: "localhost",
  SMTP_FROM: "OpenCalendar <no-reply@localhost>",
};

describe("getEnv", () => {
  it("parses process.env once and caches the result until reset", () => {
    const saved = { ...process.env };
    try {
      process.env = { ...saved, ...base };
      resetEnvCache();
      const first = getEnv();
      process.env.APP_URL = "https://changed.example.com";
      expect(getEnv()).toBe(first);
      resetEnvCache();
      expect(getEnv().APP_URL).toBe("https://changed.example.com");
    } finally {
      process.env = saved;
      resetEnvCache();
    }
  });
});

describe("parseEnv", () => {
  it("parses a minimal valid environment with defaults", () => {
    const env = parseEnv(base);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.SMTP_PORT).toBe(587);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.SIGNUP_MODE).toBe("open");
    expect(env.WORKER_MODE).toBe("external");
    expect(env.MIGRATE_ON_START).toBe(true);
    expect(env.SOURCE_URL).toBe("https://github.com/kudretyilmazz/opencalendar");
    expect(env.ALLOW_PRIVATE_NETWORK_INTEGRATIONS).toBe(false);
    expect(env.WEBHOOK_ALLOW_PRIVATE).toBe(false);
  });

  it("parses WEBHOOK_ALLOW_PRIVATE as a boolean", () => {
    expect(parseEnv({ ...base, WEBHOOK_ALLOW_PRIVATE: "true" }).WEBHOOK_ALLOW_PRIVATE).toBe(true);
    expect(parseEnv({ ...base, WEBHOOK_ALLOW_PRIVATE: "" }).WEBHOOK_ALLOW_PRIVATE).toBe(false);
  });

  it("strips a trailing slash from APP_URL", () => {
    expect(parseEnv({ ...base, APP_URL: "https://cal.example.com/" }).APP_URL).toBe("https://cal.example.com");
  });

  it("names every missing or invalid variable in the error", () => {
    const run = () => parseEnv({ APP_URL: "not-a-url" });
    expect(run).toThrow(EnvValidationError);
    try {
      run();
    } catch (error) {
      const message = (error as Error).message;
      for (const name of ["DATABASE_URL", "APP_URL", "AUTH_SECRET", "ENCRYPTION_KEY"]) {
        expect(message).toContain(name);
      }
    }
  });

  it("rejects an encryption key that is not 32 bytes", () => {
    expect(() => parseEnv({ ...base, ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(/ENCRYPTION_KEY/);
    expect(() => parseEnv({ ...base, NODE_ENV: "production", ENCRYPTION_KEY: Buffer.alloc(32).toString("base64") })).toThrow(/not random/);
  });

  it("rejects a short AUTH_SECRET", () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });

  it("parses boolean-like strings", () => {
    const env = parseEnv({ ...base, SMTP_SECURE: "true", MIGRATE_ON_START: "false" });
    expect(env.SMTP_SECURE).toBe(true);
    expect(env.MIGRATE_ON_START).toBe(false);
  });

  it("enables an OAuth provider only when both id and secret are present", () => {
    expect(parseEnv({ ...base, GOOGLE_CLIENT_ID: "id" }).oauth.google).toBeNull();
    expect(parseEnv({ ...base, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" }).oauth.google).toEqual({
      clientId: "id",
      clientSecret: "s",
    });
    expect(parseEnv({ ...base, MICROSOFT_CLIENT_ID: "id", MICROSOFT_CLIENT_SECRET: "s" }).oauth.microsoft).toEqual({
      clientId: "id",
      clientSecret: "s",
      tenantId: "common",
    });
  });

  it("rejects an unknown signup mode", () => {
    expect(() => parseEnv({ ...base, SIGNUP_MODE: "sometimes" })).toThrow(/SIGNUP_MODE/);
  });

  it("defaults trusted proxies to loopback and private networks, and parses a custom list", () => {
    expect(parseEnv(base).TRUSTED_PROXIES).toContain("10.0.0.0/8");
    expect(parseEnv({ ...base, TRUSTED_PROXIES: " 203.0.113.0/24 , 198.51.100.7/32 " }).TRUSTED_PROXIES).toEqual([
      "203.0.113.0/24",
      "198.51.100.7/32",
    ]);
  });

  it("parses the embed frame-ancestors allow-list (EMB-005)", () => {
    expect(parseEnv(base).EMBED_ALLOWED_ORIGINS).toEqual(["*"]);
    expect(parseEnv({ ...base, EMBED_ALLOWED_ORIGINS: "https://a.example https://*.b.example" }).EMBED_ALLOWED_ORIGINS).toEqual([
      "https://a.example",
      "https://*.b.example",
    ]);
    expect(() => parseEnv({ ...base, EMBED_ALLOWED_ORIGINS: "https://a.example; script-src *" })).toThrow(/EMBED_ALLOWED_ORIGINS/);
  });

  it("rejects the placeholder AUTH_SECRET in production only", () => {
    const placeholder = "change-me-to-a-long-random-string-at-least-32-chars";
    expect(() => parseEnv({ ...base, NODE_ENV: "production", AUTH_SECRET: placeholder })).toThrow(/AUTH_SECRET/);
    expect(parseEnv({ ...base, NODE_ENV: "development", AUTH_SECRET: placeholder }).AUTH_SECRET).toBe(placeholder);
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv({ ...base, SMTP_USER: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" });
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.oauth.google).toBeNull();
  });
});
