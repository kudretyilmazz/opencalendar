import { createHash } from "node:crypto";

/**
 * RFC 4122-shaped id derived from a key. pg-boss job ids must be UUIDs and an insert with an
 * existing id is ignored, so a deterministic id makes enqueueing idempotent across retries.
 */
export function stableJobId(key: string): string {
  const h = createHash("sha256").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
