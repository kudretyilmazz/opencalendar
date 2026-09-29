import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook request signing (API-002): `v1 = hex(HMAC-SHA256(secret, "<t>.<rawBody>"))`, sent as
 * `X-OpenCalendar-Signature: t=<unix seconds>,v1=<hex>`. Pure helpers, shared by the worker,
 * the tests and the documentation snippet.
 */

export const SIGNATURE_HEADER = "X-OpenCalendar-Signature";
export const EVENT_HEADER = "X-OpenCalendar-Event";
export const DELIVERY_HEADER = "X-OpenCalendar-Delivery";
export const WEBHOOK_USER_AGENT = "OpenCalendar-Webhooks/1";
export const DEFAULT_TOLERANCE_SECONDS = 300;

export function computeSignature(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signatureHeader(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${computeSignature(secret, timestamp, body)}`;
}

export type ParsedSignature = { timestamp: number; signatures: readonly string[] };

export function parseSignatureHeader(header: string | null | undefined): ParsedSignature | null {
  if (!header || header.length > 1024) return null;
  const parts = header.split(",").map((part) => part.trim().split("="));
  const t = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key, value]) => key === "v1" && value && /^[0-9a-f]{64}$/i.test(value)).map(([, value]) => value.toLowerCase());
  if (!t || !/^\d{1,12}$/.test(t) || signatures.length === 0) return null;
  return { timestamp: Number(t), signatures };
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Constant-time check of a signature header; rejects timestamps outside the tolerance (replay). */
export function verifySignature(input: {
  secret: string;
  body: string;
  header: string | null | undefined;
  nowSeconds: number;
  toleranceSeconds?: number;
}): boolean {
  const parsed = parseSignatureHeader(input.header);
  if (!parsed) return false;
  if (Math.abs(input.nowSeconds - parsed.timestamp) > (input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS)) return false;
  const expected = computeSignature(input.secret, parsed.timestamp, input.body);
  return parsed.signatures.some((candidate) => safeEqualHex(candidate, expected));
}
