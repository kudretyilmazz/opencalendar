import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { and, count, eq, gt } from "drizzle-orm";
import type { Database } from "@/db/client";
import * as schema from "@/db/schema";
import type { Env } from "@/lib/env";
import type { EmailRequest } from "@/lib/jobs/queues";
import { logger } from "@/lib/logger";
import { promoteIfNoAdmin } from "./admin";
import { clearFailedLogins, hitAccountLimit, releaseLatestAttempt, reserveSignInAttempt } from "./lockout";
import { decideSignup } from "./policy";

export type SendEmail = (request: EmailRequest) => Promise<void>;

export type AuthDeps = {
  db: Database;
  env: Pick<Env, "APP_URL" | "AUTH_SECRET" | "SIGNUP_MODE" | "TRUSTED_PROXIES" | "oauth">;
  sendEmail: SendEmail;
};

const SIGN_IN_EMAIL = "/sign-in/email";
// Per-account limits for endpoints that send email (AUTH-004), in addition to per-IP limits.
const ACCOUNT_LIMITED: Record<string, { windowMs: number; max: number }> = {
  "/sign-in/magic-link": { windowMs: 15 * 60_000, max: 5 },
  "/request-password-reset": { windowMs: 15 * 60_000, max: 5 },
};

const bodyEmail = (body: unknown): string | undefined => {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" ? email.trim().toLowerCase() : undefined;
};

// Right-most X-Forwarded-For hop: the address appended by our own reverse proxy.
const forwardedFor = (headers?: Headers): string | null =>
  headers?.get("x-forwarded-for")?.split(",").at(-1)?.trim() || null;

const SIGNUP_MESSAGES = {
  SIGNUP_DISABLED: "Sign-ups are disabled on this instance.",
  INVITE_REQUIRED: "This instance is invite-only.",
} as const;

const signupRejected = (reason: keyof typeof SIGNUP_MESSAGES) =>
  new APIError("FORBIDDEN", { message: SIGNUP_MESSAGES[reason], code: reason });

export function createAuth({ db, env, sendEmail }: AuthDeps) {
  const socialProviders = {
    ...(env.oauth.google && { google: { ...env.oauth.google, prompt: "select_account" as const } }),
    ...(env.oauth.microsoft && { microsoft: env.oauth.microsoft }),
  };

  /**
   * Invite-only (AUTH-005, TEAM-002): an invited address may create its account, but only through
   * a path that proves the address (email sign-in link or OAuth), never with a password: a
   * password sign-up would reveal that an invitation exists and could pre-create the invitee's
   * account with an attacker's password.
   */
  const currentSignupDecision = async (email: string | undefined, passwordSignup: boolean) => {
    const [{ value }] = await db.select({ value: count() }).from(schema.user);
    const invited =
      env.SIGNUP_MODE === "invite_only" && email && !passwordSignup
        ? (await db.$count(schema.teamInvitation, and(eq(schema.teamInvitation.email, email.toLowerCase()), gt(schema.teamInvitation.expiresAt, new Date())))) > 0
        : false;
    return decideSignup({ mode: env.SIGNUP_MODE, existingUserCount: value, invited });
  };

  return betterAuth({
    appName: "OpenCalendar",
    baseURL: env.APP_URL,
    secret: env.AUTH_SECRET,
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    advanced: {
      // With trusted proxies set, the client IP is the right-most untrusted X-Forwarded-For hop,
      // so a client-supplied header can't spoof it (see docs/03-architecture/self-hosting.md).
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"], trustedProxies: env.TRUSTED_PROXIES },
    },
    // Sign-in OAuth tokens (Google/Microsoft login) are stored encrypted, like integration
    // credentials (NFR-007).
    account: { encryptOAuthTokens: true },
    user: {
      // None of these are accepted from sign-up/update-user input; profile changes go through
      // the Zod-validated settings action.
      additionalFields: {
        username: { type: "string", required: false, input: false },
        timeZone: { type: "string", required: false, defaultValue: "UTC", input: false },
        locale: { type: "string", required: false, defaultValue: "en", input: false },
        weekStart: { type: "number", required: false, defaultValue: 1, input: false },
        timeFormat: { type: "number", required: false, defaultValue: 24, input: false },
        role: { type: "string", required: false, defaultValue: "user", input: false },
        disabledAt: { type: "date", required: false, input: false },
      },
    },
    // Sessions end after 7 days without use; each day of use extends them (documented in security.md).
    session: { expiresIn: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        sendEmail({ to: user.email, template: "reset-password", props: { name: user.name, url } }),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true, // unverified sign-in attempts get a fresh link (sign-in is rate-limited)
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, url }) =>
        sendEmail({ to: user.email, template: "verify-email", props: { name: user.name, url } }),
    },
    socialProviders,
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 100,
      customRules: {
        [SIGN_IN_EMAIL]: { window: 60, max: 10 },
        "/sign-in/magic-link": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Covers every creation path (email, magic link, OAuth). Everyone starts as "user".
          before: async (user, context) => {
            const decision = await currentSignupDecision(user.email, context?.path === "/sign-up/email");
            if (!decision.allowed) throw signupRejected(decision.reason);
            return { data: { ...user, role: "user" } };
          },
          // First-run bootstrap happens after commit, under a lock: exactly one admin (AUTH-005).
          after: async (user) => {
            if (await promoteIfNoAdmin(db, user.id)) logger.info("auth.first_admin_created");
          },
        },
      },
      session: {
        create: {
          // Disabled accounts can't obtain a session through any sign-in method.
          before: async (session) => {
            const [row] = await db
              .select({ disabledAt: schema.user.disabledAt })
              .from(schema.user)
              .where(eq(schema.user.id, session.userId));
            if (row?.disabledAt) {
              throw new APIError("FORBIDDEN", { message: "This account has been disabled.", code: "ACCOUNT_DISABLED" });
            }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Better Auth turns 403s from sign-up into a generic success (anti-enumeration), so
        // reject closed sign-ups before the handler runs. The mode is instance-wide, not secret.
        if (ctx.path === "/sign-up/email") {
          const decision = await currentSignupDecision(bodyEmail(ctx.body) ?? undefined, true);
          if (!decision.allowed) throw signupRejected(decision.reason);
        }
        const email = bodyEmail(ctx.body);
        if (!email) return;
        if (ctx.path === SIGN_IN_EMAIL) {
          const lock = await reserveSignInAttempt(db, email, forwardedFor(ctx.request?.headers));
          if (lock.locked) {
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "Too many failed sign-in attempts. Try again later or use a sign-in link.",
              code: "ACCOUNT_LOCKED",
            });
          }
        }
        const limit = ACCOUNT_LIMITED[ctx.path];
        if (limit && (await hitAccountLimit(db, { key: `acct:${ctx.path}:${email}`, ...limit }))) {
          throw new APIError("TOO_MANY_REQUESTS", { message: "Too many requests for this account. Try again later." });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== SIGN_IN_EMAIL) return;
        const email = bodyEmail(ctx.body);
        if (!email) return;
        const returned = ctx.context.returned;
        if (!isAPIError(returned)) return clearFailedLogins(db, email);
        // A wrong password (401) keeps its reserved attempt; the lockout rejection (429) never
        // reserved one; anything else (e.g. unverified email) isn't a password guess.
        if (returned.statusCode !== 401 && returned.statusCode !== 429) await releaseLatestAttempt(db, email);
      }),
    },
    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => sendEmail({ to: email, template: "magic-link", props: { url } }),
      }),
      nextCookies(), // must stay last
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
