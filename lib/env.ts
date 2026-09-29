import { z } from "zod";
import { EmbedOriginsError, parseEmbedAllowedOrigins } from "@/lib/security/csp";

/**
 * Runtime configuration (ADM-002). Everything is read from process.env at runtime and
 * validated here, never baked into the build via NEXT_PUBLIC_* (see ADR-0003).
 */

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const booleanish = (fallback: boolean) =>
  z.preprocess(
    emptyToUndefined,
    z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((value) => (value === undefined ? fallback : value === "true" || value === "1")),
  );

const base64Key32 = z.string().refine(
  (value) => Buffer.from(value, "base64").length === 32,
  "must be 32 bytes encoded as base64 (openssl rand -base64 32)",
);

// Loopback and private networks: typical reverse proxy / Docker network addresses.
const DEFAULT_TRUSTED_PROXIES = "127.0.0.1/32,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7";

const PLACEHOLDER_SECRET = /change-me/i;

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// connection URL"),
  /** Connections per app process; keep (replicas × this + workers) below Postgres max_connections. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(2).max(200).default(20),
  APP_URL: z
    .string()
    .url()
    .transform((value) => value.replace(/\/+$/, "")),
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  ENCRYPTION_KEY: base64Key32,
  ENCRYPTION_KEY_PREVIOUS: z.preprocess(emptyToUndefined, base64Key32.optional()),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_SECURE: booleanish(false),
  SMTP_FROM: z.string().min(3),

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  MICROSOFT_CLIENT_ID: optionalString,
  MICROSOFT_CLIENT_SECRET: optionalString,
  MICROSOFT_TENANT_ID: z.preprocess(emptyToUndefined, z.string().default("common")),
  ZOOM_CLIENT_ID: optionalString,
  ZOOM_CLIENT_SECRET: optionalString,
  JITSI_BASE_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .url()
      .default("https://meet.jit.si")
      .transform((value) => value.replace(/\/+$/, "")),
  ),
  /** Lets CalDAV servers and ICS feeds live on private networks (e.g. a LAN Nextcloud). */
  ALLOW_PRIVATE_NETWORK_INTEGRATIONS: booleanish(false),
  /** Lets webhook targets be private/loopback addresses and plain http (e.g. a LAN n8n). */
  WEBHOOK_ALLOW_PRIVATE: booleanish(false),
  /** AVL-007: how often connected calendars are re-read (CalDAV/ICS; Google/Microsoft at most every 2 min). */
  CALENDAR_POLL_SECONDS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(30).max(3600).default(300)),
  /** ADM-007: "altcha" adds a privacy-friendly proof-of-work check to public booking. */
  CAPTCHA: z.enum(["off", "altcha"]).default("off"),
  /** Enables GET /api/metrics when set; requests must send "Authorization: Bearer <token>". */
  METRICS_TOKEN: z.preprocess(emptyToUndefined, z.string().min(16).optional()),

  SIGNUP_MODE: z.preprocess(
    emptyToUndefined,
    z.enum(["open", "invite_only", "disabled"]).default("open"),
  ),
  WORKER_MODE: z.preprocess(emptyToUndefined, z.enum(["external", "inline"]).default("external")),
  MIGRATE_ON_START: booleanish(true),
  // Reverse proxies whose X-Forwarded-For entries are trusted (CIDRs, comma-separated).
  TRUSTED_PROXIES: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .default(DEFAULT_TRUSTED_PROXIES)
      .transform((value) =>
        value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
  ),
  /**
   * Origins allowed to frame public booking pages in embed mode (EMB-005), space-separated,
   * e.g. "https://example.com https://*.example.org". Unset = any origin; "none" = no embedding.
   * proxy.ts reads the raw value per request; this validates it at startup.
   */
  EMBED_ALLOWED_ORIGINS: z.string().optional().transform((value, ctx) => {
    try {
      return parseEmbedAllowedOrigins(value);
    } catch (error) {
      ctx.addIssue({ code: "custom", message: error instanceof EmbedOriginsError ? error.message : "is invalid" });
      return z.NEVER;
    }
  }),
  LOG_LEVEL: z.preprocess(
    emptyToUndefined,
    z.enum(["debug", "info", "warn", "error"]).default("info"),
  ),
  SOURCE_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().default("https://github.com/kudretyilmazz/opencalendar"),
  ),
});

const schema = baseSchema.superRefine((env, ctx) => {
  // A hand-typed or zero-filled key is not random: refuse it in production (NFR-007).
  for (const name of ["ENCRYPTION_KEY", "ENCRYPTION_KEY_PREVIOUS"] as const) {
    const value = env[name];
    if (env.NODE_ENV === "production" && value && new Set(Buffer.from(value, "base64")).size < 16) {
      ctx.addIssue({ code: "custom", path: [name], message: "is not random; generate it with `openssl rand -base64 32`" });
    }
  }
  if (env.NODE_ENV === "production" && PLACEHOLDER_SECRET.test(env.AUTH_SECRET)) {
    ctx.addIssue({ code: "custom", path: ["AUTH_SECRET"], message: "still has the placeholder value from .env.example" });
  }
});

type RawEnv = z.infer<typeof schema>;

export type OAuthClient = { clientId: string; clientSecret: string };

export type Env = RawEnv & {
  oauth: {
    google: OAuthClient | null;
    microsoft: (OAuthClient & { tenantId: string }) | null;
    zoom: OAuthClient | null;
  };
};

export class EnvValidationError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvValidationError";
  }
}

const pair = (id?: string, secret?: string): OAuthClient | null =>
  id && secret ? { clientId: id, clientSecret: secret } : null;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const name = issue.path.join(".") || "(root)";
      const received = source[name];
      const detail = received === undefined || received === "" ? "is required" : issue.message;
      return `${name} ${detail}`;
    });
    throw new EnvValidationError(issues);
  }
  const env = result.data;
  const microsoft = pair(env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET);
  return {
    ...env,
    oauth: {
      google: pair(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
      microsoft: microsoft ? { ...microsoft, tenantId: env.MICROSOFT_TENANT_ID } : null,
      zoom: pair(env.ZOOM_CLIENT_ID, env.ZOOM_CLIENT_SECRET),
    },
  };
}

let cached: Env | undefined;

/** Lazily parsed, process-wide env. Throws EnvValidationError naming each bad variable. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Test helper: forget the cached env so the next getEnv() re-reads process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
