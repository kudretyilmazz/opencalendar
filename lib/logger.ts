/**
 * Tiny structured JSON logger (stdout). Never pass secrets, tokens or full email bodies here
 * (NFR-007): log identifiers and outcomes only.
 */

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = process.env.LOG_LEVEL as Level | undefined;
  return ORDER[configured ?? "info"] ?? ORDER.info;
}

function write(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  if (ORDER[level] < threshold() || process.env.NODE_ENV === "test") return;
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  (level === "error" || level === "warn" ? process.stderr : process.stdout).write(`${line}\n`);
}

/**
 * Safe error fields for logs: the error class and machine codes only. Messages are dropped
 * because SMTP/pg errors embed recipients, hosts and connection details (NFR-007).
 */
export function errorSummary(error: unknown): Record<string, string | number> {
  if (!(error instanceof Error)) return { error: typeof error };
  const { code, responseCode } = error as Error & { code?: unknown; responseCode?: unknown };
  return {
    error: error.name,
    ...(typeof code === "string" || typeof code === "number" ? { code } : {}),
    ...(typeof responseCode === "number" ? { responseCode } : {}),
  };
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => write("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
};
