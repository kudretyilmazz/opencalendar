export type WebhookErrorCode = "NOT_FOUND" | "EVENT_TYPE_NOT_FOUND" | "LIMIT_REACHED" | "NOT_RETRYABLE";

export class WebhookError extends Error {
  constructor(public readonly code: WebhookErrorCode) {
    super(code);
    this.name = "WebhookError";
  }
}
