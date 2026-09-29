import { lookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { IntegrationError } from "./errors";
import type { FetchLike } from "./types";

/**
 * Fetch for user-supplied URLs (CalDAV servers, ICS feeds): blocks private, loopback,
 * link-local and other internal ranges (SSRF), re-checks every redirect hop, and enforces a
 * timeout and a response size cap. The address check runs again inside the socket's DNS lookup
 * (pinned agent), so a host that re-resolves to a private address after the pre-check (DNS
 * rebinding) is still refused. Credentials are not forwarded across origins on redirects. Set `allowPrivate` (ALLOW_PRIVATE_NETWORK_INTEGRATIONS) for
 * LAN installs such as a local Nextcloud.
 */

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 96], // unspecified, loopback and IPv4-compatible
  ["64:ff9b::", 96], // NAT64 can reach internal IPv4
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32], // Teredo embeds arbitrary IPv4
  ["2001:db8::", 32],
  ["::ffff:0:0:0", 96], // SIIT (IPv4-translated)
  ["fec0::", 10], // deprecated site-local
  ["2002::", 16], // 6to4 embeds arbitrary IPv4
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 6 && address.toLowerCase().startsWith("::ffff:")) {
    const mapped = address.slice(7);
    if (isIP(mapped) === 4) return blocked.check(mapped, "ipv4");
  }
  return blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

export type SafeFetchOptions = {
  allowPrivate: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Injected for tests. */
  resolve?: (host: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
};

async function defaultResolve(host: string): Promise<string[]> {
  return (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);
}

/**
 * DNS lookup for the socket itself: resolves, refuses if any address is internal, and hands only
 * checked addresses to the connection, closing the gap between the pre-check and connect.
 */
export function guardedLookup(resolve: (host: string) => Promise<string[]> = defaultResolve): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
          callback(Object.assign(new Error("This address is not allowed (private network)"), { code: "EBLOCKED" }), "", 4);
          return;
        }
        if (options.all) callback(null, addresses.map((address) => ({ address, family: isIP(address) })));
        else callback(null, addresses[0], isIP(addresses[0]));
      },
      (error: NodeJS.ErrnoException) => callback(error, "", 4),
    );
  };
}

let pinnedAgent: Agent | undefined;
function pinnedFetch(): typeof fetch {
  pinnedAgent ??= new Agent({ connect: { lookup: guardedLookup() } });
  const dispatcher = pinnedAgent;
  return ((url: URL, init: RequestInit) => undiciFetch(url, { ...(init as object), dispatcher })) as unknown as typeof fetch;
}

/** Headers for the next redirect hop: never forward credentials to another origin. */
export function redirectHeaders(headers: HeadersInit | undefined, from: URL, to: URL): Headers {
  const next = new Headers(headers);
  if (from.origin !== to.origin) {
    next.delete("authorization");
    next.delete("cookie");
    next.delete("proxy-authorization");
  }
  return next;
}

async function assertAllowedUrl(raw: string, options: SafeFetchOptions): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new IntegrationError("invalid", "Invalid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new IntegrationError("invalid", "Only http(s) URLs are allowed");
  if (url.username || url.password) throw new IntegrationError("invalid", "Credentials in URLs are not allowed");
  if (options.allowPrivate) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await (options.resolve ?? defaultResolve)(host).catch(() => []);
  if (addresses.length === 0) throw new IntegrationError("transient", "Host could not be resolved");
  if (addresses.some(isBlockedAddress)) throw new IntegrationError("invalid", "This address is not allowed (private network)");
  return url;
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new IntegrationError("invalid", "Response too large");
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new IntegrationError("invalid", "Response too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function isBlockedLookup(error: unknown): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if ((e as NodeJS.ErrnoException).code === "EBLOCKED") return true;
  }
  return false;
}

export function createSafeFetch(options: SafeFetchOptions): FetchLike {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 3;
  const doFetch = options.fetchImpl ?? (options.allowPrivate ? fetch : pinnedFetch());

  return async (raw, firstInit = {}) => {
    let target = raw;
    let init: RequestInit = firstInit;
    let previous: URL | undefined;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const url = await assertAllowedUrl(target, options);
      if (previous) init = { ...init, headers: redirectHeaders(init.headers, previous, url) };
      let response: Response;
      try {
        response = await doFetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        if (error instanceof IntegrationError) throw error;
        if (isBlockedLookup(error)) throw new IntegrationError("invalid", "This address is not allowed (private network)");
        throw new IntegrationError("transient", `Request failed (${error instanceof Error ? error.name : "Error"})`);
      }
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel().catch(() => undefined);
        target = new URL(location, url).toString();
        previous = url;
        if (response.status === 303) init = { ...init, method: "GET", body: undefined };
        continue;
      }
      const body = await readLimited(response, maxBytes);
      return new Response(response.status === 204 || response.status === 304 ? null : Buffer.from(body), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    throw new IntegrationError("invalid", "Too many redirects");
  };
}

/** Fetch with a timeout for fixed provider APIs (Google, Microsoft, Zoom). */
export function createProviderFetch(timeoutMs = 10_000, fetchImpl: typeof fetch = fetch): FetchLike {
  return async (url, init = {}) => {
    try {
      return await fetchImpl(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new IntegrationError("transient", `Request failed (${error instanceof Error ? error.name : "Error"})`);
    }
  };
}
