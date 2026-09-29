import { describe, expect, it, vi } from "vitest";
import { IntegrationError } from "./errors";
import { createSafeFetch, guardedLookup, isBlockedAddress, redirectHeaders } from "./safe-fetch";

describe("isBlockedAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "0.0.0.0", "not-an-ip", "64:ff9b::a00:1", "2002:a00:1::1", "192.0.2.1", "198.51.100.7", "203.0.113.9", "::a00:1"])(
    "blocks %s",
    (ip) => expect(isBlockedAddress(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "17.253.144.10", "2001:4860:4860::8888"])("allows %s", (ip) => expect(isBlockedAddress(ip)).toBe(false));
});

const ok = (body = "ok", init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

describe("createSafeFetch (SSRF)", () => {
  const publicResolve = async () => ["93.184.216.34"];

  it("fetches public hosts", async () => {
    const fetchImpl = vi.fn(async () => ok("BEGIN:VCALENDAR"));
    const f = createSafeFetch({ allowPrivate: false, resolve: publicResolve, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await (await f("https://calendar.example.com/feed.ics")).text()).toBe("BEGIN:VCALENDAR");
  });

  it("rejects hosts resolving to private addresses, literal private IPs and non-http schemes", async () => {
    const fetchImpl = vi.fn(async () => ok());
    const f = createSafeFetch({ allowPrivate: false, resolve: async () => ["10.0.0.5"], fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(f("https://intranet.example.com/x")).rejects.toMatchObject({ kind: "invalid" });
    await expect(f("http://169.254.169.254/latest/meta-data")).rejects.toThrow(IntegrationError);
    await expect(f("http://[::1]:8080/")).rejects.toThrow(IntegrationError);
    await expect(f("file:///etc/passwd")).rejects.toThrow(/http/);
    await expect(f("https://user:pw@example.com/")).rejects.toThrow(/Credentials/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("re-checks redirect targets", async () => {
    const fetchImpl = vi.fn(async (url: URL) =>
      url.hostname === "public.example.com"
        ? new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } })
        : ok(),
    );
    const f = createSafeFetch({ allowPrivate: false, resolve: publicResolve, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(f("https://public.example.com/feed")).rejects.toMatchObject({ kind: "invalid" });
  });

  it("follows allowed redirects up to the limit", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => (n++ < 5 ? new Response(null, { status: 302, headers: { location: `/r${n}` } }) : ok()));
    const f = createSafeFetch({ allowPrivate: false, resolve: publicResolve, fetchImpl: fetchImpl as unknown as typeof fetch, maxRedirects: 2 });
    await expect(f("https://example.com/")).rejects.toThrow(/redirects/);
  });

  it("caps the response size", async () => {
    const fetchImpl = vi.fn(async () => ok("x".repeat(2000)));
    const f = createSafeFetch({ allowPrivate: false, resolve: publicResolve, fetchImpl: fetchImpl as unknown as typeof fetch, maxBytes: 1000 });
    await expect(f("https://example.com/big.ics")).rejects.toThrow(/too large/);
  });

  it("allows private networks when explicitly enabled (LAN Nextcloud)", async () => {
    const fetchImpl = vi.fn(async () => ok());
    const f = createSafeFetch({ allowPrivate: true, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await f("http://192.168.1.10/remote.php/dav")).status).toBe(200);
  });

  it("maps network failures to transient errors", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const f = createSafeFetch({ allowPrivate: false, resolve: publicResolve, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(f("https://example.com/")).rejects.toMatchObject({ kind: "transient" });
  });
});

describe("DNS rebinding and redirect credentials", () => {
  const lookupResult = (resolve: (h: string) => Promise<string[]>, all: boolean) =>
    new Promise<{ error: Error | null; value: unknown }>((done) =>
      guardedLookup(resolve)("cal.example.com", { all }, (error, value) => done({ error, value })),
    );

  it("refuses at connect time when the host now resolves to a private address", async () => {
    const r = await lookupResult(async () => ["93.184.216.34", "10.0.0.1"], true);
    expect(r.error).toMatchObject({ code: "EBLOCKED" });
  });

  it("passes checked public addresses to the socket", async () => {
    expect((await lookupResult(async () => ["93.184.216.34"], true)).value).toEqual([{ address: "93.184.216.34", family: 4 }]);
    expect((await lookupResult(async () => ["2001:4860:4860::8888"], false)).value).toBe("2001:4860:4860::8888");
  });

  it("drops Authorization and cookies on cross-origin redirects only", () => {
    const init = { authorization: "Basic abc", cookie: "a=b", depth: "1" };
    const same = redirectHeaders(init, new URL("https://a.example.com/x"), new URL("https://a.example.com/y"));
    expect(same.get("authorization")).toBe("Basic abc");
    const cross = redirectHeaders(init, new URL("https://a.example.com/x"), new URL("https://b.example.com/y"));
    expect(cross.get("authorization")).toBeNull();
    expect(cross.get("cookie")).toBeNull();
    expect(cross.get("depth")).toBe("1");
  });

  it("does not forward credentials when a server redirects to another host", async () => {
    const seen: (string | null)[] = [];
    const fetchImpl = vi.fn(async (url: URL, init: RequestInit) => {
      seen.push(new Headers(init.headers).get("authorization"));
      return url.hostname === "a.example.com" ? new Response(null, { status: 302, headers: { location: "https://b.example.com/dav" } }) : ok();
    });
    const f = createSafeFetch({ allowPrivate: false, resolve: async () => ["93.184.216.34"], fetchImpl: fetchImpl as unknown as typeof fetch });
    await f("https://a.example.com/dav", { headers: { authorization: "Basic secret" } });
    expect(seen).toEqual(["Basic secret", null]);
  });

  it("maps a connect-time block to an invalid (not transient) error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("blocked"), { code: "EBLOCKED" }) });
    });
    const f = createSafeFetch({ allowPrivate: false, resolve: async () => ["93.184.216.34"], fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(f("https://rebind.example.com/")).rejects.toMatchObject({ kind: "invalid" });
  });
});
