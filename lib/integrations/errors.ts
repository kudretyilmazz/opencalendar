/**
 * Provider errors normalized for callers (docs/03-architecture/integrations.md):
 * "auth" marks the credential invalid (INT-012); "transient" / "rate_limited" may be retried.
 */
export type IntegrationErrorKind = "auth" | "rate_limited" | "not_found" | "transient" | "invalid";

export class IntegrationError extends Error {
  constructor(
    public readonly kind: IntegrationErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

export function kindForStatus(status: number): IntegrationErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404 || status === 410) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "transient";
  return "invalid";
}

/** Throws a normalized error for non-2xx responses; the body is never included (may hold PII). */
export async function ensureOk(response: Response, what: string): Promise<Response> {
  if (response.ok) return response;
  await response.body?.cancel().catch(() => undefined);
  throw new IntegrationError(kindForStatus(response.status), `${what} failed with HTTP ${response.status}`, response.status);
}

/** Maps network failures (DNS, timeouts, refused connections) to "transient". */
export function toIntegrationError(error: unknown, what: string): IntegrationError {
  if (error instanceof IntegrationError) return error;
  const name = error instanceof Error ? error.name : "Error";
  return new IntegrationError("transient", `${what} failed (${name})`);
}
