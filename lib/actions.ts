import type { ZodError, ZodType } from "zod";

/** Standard result for form-backed server actions. */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
};

export const idle: ActionState = { status: "idle" };

export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}

/** Parses the JSON `payload` field that client editors submit, then validates it. */
export function parsePayload<T>(formData: FormData, schema: ZodType<T>): { ok: true; data: T } | { ok: false; state: ActionState } {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { ok: false, state: { status: "error", message: "The form could not be read. Please reload and try again." } };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, state: { status: "error", message: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) } };
  }
  return { ok: true, data: parsed.data };
}
