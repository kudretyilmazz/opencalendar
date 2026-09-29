import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isBlockedAddress } from "@/lib/integrations/safe-fetch";

/**
 * Save-time check of a webhook target (API-004) for a friendly form error. The real guard is
 * the SSRF-safe fetch at delivery time, which re-resolves and pins the address.
 */

export const MAX_WEBHOOK_URL_LENGTH = 2048;

export type UrlCheckOptions = {
  allowPrivate: boolean;
  /** Injected for tests. */
  resolve?: (host: string) => Promise<string[]>;
};

export type UrlCheck = { ok: true; url: string } | { ok: false; message: string };

async function defaultResolve(host: string): Promise<string[]> {
  return (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);
}

export async function checkWebhookUrl(raw: string, options: UrlCheckOptions): Promise<UrlCheck> {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_WEBHOOK_URL_LENGTH) return { ok: false, message: "Enter the endpoint URL" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, message: "Enter a valid URL" };
  }
  const httpAllowed = options.allowPrivate && url.protocol === "http:";
  if (url.protocol !== "https:" && !httpAllowed) return { ok: false, message: "Use an https:// address" };
  if (url.username || url.password) return { ok: false, message: "Credentials in URLs are not allowed" };
  if (options.allowPrivate) return { ok: true, url: url.toString() };

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await (options.resolve ?? defaultResolve)(host).catch(() => [] as string[]);
  if (addresses.length === 0) return { ok: false, message: "This host could not be resolved" };
  if (addresses.some(isBlockedAddress)) return { ok: false, message: "Private, loopback and link-local addresses are not allowed" };
  return { ok: true, url: url.toString() };
}
