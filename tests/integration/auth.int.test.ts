import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { team, teamInvitation, user } from "@/db/schema";
import { LOCKOUT_MAX_FAILURES } from "@/lib/auth/policy";
import { authRequest, resetDatabase, testAuth, testDatabase, tokenFromUrl } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(() => resetDatabase(db));

const PASSWORD = "correct horse battery";

async function signUp(auth: ReturnType<typeof testAuth>["auth"], email: string, ip?: string) {
  return auth.handler(authRequest("/sign-up/email", { email, password: PASSWORD, name: "Test User" }, ip));
}

async function signIn(auth: ReturnType<typeof testAuth>["auth"], email: string, password = PASSWORD, ip?: string) {
  return auth.handler(authRequest("/sign-in/email", { email, password }, ip));
}

describe("sign-up (AUTH-001, AUTH-005)", () => {
  it("makes the first user admin and later users regular users", async () => {
    const { auth } = testAuth(db);
    expect((await signUp(auth, "first@example.com")).status).toBe(200);
    expect((await signUp(auth, "second@example.com", "203.0.113.11")).status).toBe(200);

    const rows = await db.select({ email: user.email, role: user.role }).from(user);
    expect(rows).toEqual(
      expect.arrayContaining([
        { email: "first@example.com", role: "admin" },
        { email: "second@example.com", role: "user" },
      ]),
    );
  });

  it("sends a verification email on sign-up", async () => {
    const { auth, sent } = testAuth(db);
    await signUp(auth, "ada@example.com");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "ada@example.com", template: "verify-email" });
  });

  it("rejects new users when sign-up is disabled, but still bootstraps the first admin", async () => {
    const { auth } = testAuth(db, { signupMode: "disabled" });
    expect((await signUp(auth, "admin@example.com")).status).toBe(200);
    const res = await signUp(auth, "late@example.com", "203.0.113.12");
    expect(res.status).toBe(403);
    expect(await db.select().from(user).where(eq(user.email, "late@example.com"))).toHaveLength(0);
  });

  it("rejects uninvited users in invite-only mode", async () => {
    const { auth } = testAuth(db, { signupMode: "invite_only" });
    await signUp(auth, "admin@example.com");
    expect((await signUp(auth, "late@example.com", "203.0.113.13")).status).toBe(403);
  });

  it("admits an invited address in invite-only mode through an email link, never a password (AUTH-005, TEAM-002)", async () => {
    const { auth, sent } = testAuth(db, { signupMode: "invite_only" });
    await signUp(auth, "admin@example.com");
    await db.insert(team).values({ id: "t1", name: "Acme", slug: "acme" });
    await db.insert(teamInvitation).values({ id: "i1", teamId: "t1", email: "invited@example.com", role: "member", expiresAt: new Date(Date.now() + 86_400_000) });
    await db.insert(teamInvitation).values({ id: "i2", teamId: "t1", email: "expired@example.com", role: "member", expiresAt: new Date(Date.now() - 1000) });
    // Password sign-up answers the same for invited and uninvited addresses (no probe).
    expect((await signUp(auth, "invited@example.com", "203.0.113.14")).status).toBe(403);
    expect(await db.select().from(user).where(eq(user.email, "invited@example.com"))).toHaveLength(0);
    // The email link proves the address and creates the account.
    const linkFor = async (email: string) => {
      await auth.handler(authRequest("/sign-in/magic-link", { email }, "203.0.113.15"));
      return sent.filter((m) => m.template === "magic-link").at(-1)!.props.url;
    };
    await auth.handler(new Request(await linkFor("invited@example.com")));
    const [created] = await db.select().from(user).where(eq(user.email, "invited@example.com"));
    expect(created).toMatchObject({ emailVerified: true, role: "user" });
    await auth.handler(new Request(await linkFor("expired@example.com")));
    expect(await db.select().from(user).where(eq(user.email, "expired@example.com"))).toHaveLength(0);
  });

});

describe("sign-in and verification (AUTH-001)", () => {
  it("refuses sign-in until the email is verified, then allows it", async () => {
    const { auth, sent } = testAuth(db);
    await signUp(auth, "ada@example.com");
    expect((await signIn(auth, "ada@example.com")).status).toBe(403);

    const verifyUrl = sent.find((m) => m.template === "verify-email")!.props.url;
    const verified = await auth.handler(new Request(verifyUrl));
    expect([200, 302]).toContain(verified.status);

    const res = await signIn(auth, "ada@example.com");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/session_token/);
  });

  it("resets a password with a single-use link", async () => {
    const { auth, sent } = testAuth(db);
    await signUp(auth, "ada@example.com");
    await db.update(user).set({ emailVerified: true });

    await auth.handler(authRequest("/request-password-reset", { email: "ada@example.com", redirectTo: "/reset-password" }));
    const resetUrl = sent.find((m) => m.template === "reset-password")!.props.url;
    const token = new URL(resetUrl).pathname.split("/").pop()!;

    const newPassword = "an even better passphrase";
    expect((await auth.handler(authRequest("/reset-password", { token, newPassword }))).status).toBe(200);
    expect((await auth.handler(authRequest("/reset-password", { token, newPassword: "yet another one!!" }))).status).toBe(400);
    expect((await signIn(auth, "ada@example.com", newPassword)).status).toBe(200);
  });
});

describe("magic link (AUTH-002)", () => {
  it("signs a user in with a single-use link", async () => {
    const { auth, sent } = testAuth(db);
    await auth.handler(authRequest("/sign-in/magic-link", { email: "new@example.com" }));
    const url = sent.find((m) => m.template === "magic-link")!.props.url;

    const first = await auth.handler(new Request(url));
    expect(first.headers.get("set-cookie")).toMatch(/session_token/);
    const [created] = await db.select().from(user).where(eq(user.email, "new@example.com"));
    expect(created.emailVerified).toBe(true);

    const second = await auth.handler(new Request(url));
    expect(second.headers.get("set-cookie") ?? "").not.toMatch(/session_token=[^;]+;/);
  });

  it("a magic link to an unverified sign-up removes the password someone else may have set (pre-hijack)", async () => {
    // Team invitations trust a verified email (TEAM-002): an attacker must not end up with a
    // verified account on someone else's address by signing up first.
    const { auth, sent } = testAuth(db);
    expect((await signUp(auth, "victim@example.com")).status).toBe(200);
    await auth.handler(authRequest("/sign-in/magic-link", { email: "victim@example.com" }));
    const url = sent.find((m) => m.template === "magic-link")!.props.url;
    await auth.handler(new Request(url));
    const [victim] = await db.select().from(user).where(eq(user.email, "victim@example.com"));
    expect(victim.emailVerified).toBe(true);
    expect((await signIn(auth, "victim@example.com", PASSWORD)).status).not.toBe(200);
  });

  it("limits magic-link requests per account across IPs", async () => {
    const { auth } = testAuth(db);
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await auth.handler(authRequest("/sign-in/magic-link", { email: "target@example.com" }, `198.51.100.${i}`));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it("keeps the token out of plain storage", async () => {
    const { auth, sent } = testAuth(db);
    await auth.handler(authRequest("/sign-in/magic-link", { email: "x@example.com" }));
    const first = sent[0];
    if (first.template !== "magic-link") throw new Error("expected a magic link");
    const token = tokenFromUrl(first.props.url);
    const rows = await db.query.verification.findMany();
    expect(rows.some((r) => r.identifier.includes(token) || r.value.includes(token))).toBe(false);
  });
});

describe("rate limiting and lockout (AUTH-004)", () => {
  it("locks the account after repeated failures, even with the right password", async () => {
    const { auth } = testAuth(db);
    await signUp(auth, "ada@example.com");
    await db.update(user).set({ emailVerified: true });

    // Spread attempts over IPs so the per-IP limiter doesn't trigger first.
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i++) {
      expect((await signIn(auth, "ada@example.com", "wrong password!!", `192.0.2.${i}`)).status).toBe(401);
    }
    const locked = await signIn(auth, "ada@example.com", PASSWORD, "192.0.2.200");
    expect(locked.status).toBe(429);
    expect(await locked.json()).toMatchObject({ code: "ACCOUNT_LOCKED" });
  });

  it("clears failures after a successful sign-in", async () => {
    const { auth } = testAuth(db);
    await signUp(auth, "ada@example.com");
    await db.update(user).set({ emailVerified: true });
    for (let i = 0; i < LOCKOUT_MAX_FAILURES - 1; i++) {
      await signIn(auth, "ada@example.com", "wrong password!!", `192.0.2.${i}`);
    }
    expect((await signIn(auth, "ada@example.com", PASSWORD, "192.0.2.100")).status).toBe(200);
    expect((await signIn(auth, "ada@example.com", "wrong password!!", "192.0.2.101")).status).toBe(401);
    expect((await signIn(auth, "ada@example.com", PASSWORD, "192.0.2.102")).status).toBe(200);
  });

  it("rate-limits sign-in attempts per IP", async () => {
    const { auth } = testAuth(db);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await signIn(auth, `nobody${i}@example.com`, "whatever password", "203.0.113.99");
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});

describe("review hardening", () => {
  it("makes exactly one admin when the first sign-ups race (AUTH-005)", async () => {
    const { auth } = testAuth(db);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => signUp(auth, `racer${i}@example.com`, `198.18.0.${i}`)),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    const admins = await db.select().from(user).where(eq(user.role, "admin"));
    expect(admins).toHaveLength(1);
  });

  it("locks the account even when wrong guesses arrive in parallel (AUTH-004)", async () => {
    const { auth } = testAuth(db);
    await signUp(auth, "ada@example.com");
    await db.update(user).set({ emailVerified: true });
    const burst = await Promise.all(
      Array.from({ length: 25 }, (_, i) => signIn(auth, "ada@example.com", "wrong password!!", `192.0.2.${i}`)),
    );
    const statuses = burst.map((r) => r.status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(LOCKOUT_MAX_FAILURES);
    expect(statuses.filter((s) => s === 429)).toHaveLength(25 - LOCKOUT_MAX_FAILURES);
  });

  it("does not count unverified-email rejections as failed guesses", async () => {
    const { auth } = testAuth(db);
    await signUp(auth, "ada@example.com");
    for (let i = 0; i < LOCKOUT_MAX_FAILURES + 2; i++) {
      expect((await signIn(auth, "ada@example.com", PASSWORD, `192.0.2.${i}`)).status).toBe(403);
    }
    await db.update(user).set({ emailVerified: true });
    expect((await signIn(auth, "ada@example.com", PASSWORD, "192.0.2.99")).status).toBe(200);
  });

  it("refuses sessions for disabled accounts", async () => {
    const { auth } = testAuth(db);
    await signUp(auth, "ada@example.com");
    await db.update(user).set({ emailVerified: true, disabledAt: new Date() });
    const res = await signIn(auth, "ada@example.com");
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/session_token=[^;]+;/);
  });

  it("ignores profile fields sent in the sign-up body", async () => {
    const { auth } = testAuth(db);
    await auth.handler(
      authRequest("/sign-up/email", {
        email: "ada@example.com",
        password: PASSWORD,
        name: "Ada",
        timeZone: "Not/AZone",
        locale: "x".repeat(500),
        role: "admin",
      }),
    );
    const [row] = await db.select().from(user).where(eq(user.email, "ada@example.com"));
    expect(row).toMatchObject({ timeZone: "UTC", locale: "en" });
  });

  it("keys per-IP limits on the proxy-appended address, not a spoofed left-most value", async () => {
    const { auth } = testAuth(db);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      // Attacker rotates a fake left-most hop; our proxy (10.0.0.2) appended the real client IP.
      const req = new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          "x-forwarded-for": `1.2.3.${i}, 203.0.113.77, 10.0.0.2`,
        },
        body: JSON.stringify({ email: `nobody${i}@example.com`, password: "whatever password" }),
      });
      statuses.push((await auth.handler(req)).status);
    }
    expect(statuses).toContain(429);
  });
});
