import { describe, expect, it } from "vitest";
import { attemptText, type DeliveryFacts, deliveredPercent, deliveryRow, deliveryWhen, endpointHost, lastDeliveryText, responsePill, timeAgo, webhookHealth } from "./overview";

const now = Date.parse("2026-09-30T12:00:00Z");
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000);
const ok = (minutesAgo: number): DeliveryFacts => ({ status: "success", attempts: 1, responseStatus: 200, error: null, createdAt: at(minutesAgo) });
const failed = (minutesAgo: number, code: number | null = 500): DeliveryFacts => ({
  status: "failed",
  attempts: 11,
  responseStatus: code,
  error: "HTTP 500",
  createdAt: at(minutesAgo),
});
const retrying = (minutesAgo: number): DeliveryFacts => ({ status: "pending", attempts: 2, responseStatus: 502, error: "HTTP 502", createdAt: at(minutesAgo) });
const queued = (minutesAgo: number): DeliveryFacts => ({ status: "pending", attempts: 0, responseStatus: null, error: null, createdAt: at(minutesAgo) });

describe("webhookHealth", () => {
  it("is paused when inactive, whatever the deliveries", () => {
    expect(webhookHealth(false, [failed(1)])).toBe("paused");
  });

  it("is failing when the latest tried delivery failed or is retrying", () => {
    expect(webhookHealth(true, [failed(1), ok(5)])).toBe("failing");
    expect(webhookHealth(true, [queued(0), retrying(2), ok(5)])).toBe("failing");
  });

  it("is active otherwise, including without deliveries", () => {
    expect(webhookHealth(true, [queued(0), ok(1), failed(5)])).toBe("active");
    expect(webhookHealth(true, [])).toBe("active");
  });
});

describe("timeAgo", () => {
  it("rounds down to minutes, hours and days", () => {
    expect(timeAgo(now - 20_000, now)).toBe("just now");
    expect(timeAgo(now + 5000, now)).toBe("just now");
    expect(timeAgo(at(4).getTime(), now)).toBe("4 min ago");
    expect(timeAgo(at(185).getTime(), now)).toBe("3 h ago");
    expect(timeAgo(at(3 * 24 * 60).getTime(), now)).toBe("3 d ago");
  });
});

describe("lastDeliveryText", () => {
  it("describes the latest delivery with its status code", () => {
    expect(lastDeliveryText([ok(4)], now)).toBe("Last delivery 4 min ago · 200");
    expect(lastDeliveryText([failed(10), ok(60)], now)).toBe("Last delivery failed 10 min ago · 500");
    expect(lastDeliveryText([failed(1, null), ok(60)], now)).toBe("Last delivery failed 1 min ago");
  });

  it("counts the failure streak", () => {
    expect(lastDeliveryText([queued(0), retrying(1), failed(2), failed(3), ok(4)], now)).toBe("Last 3 deliveries failed · 502");
    expect(lastDeliveryText([failed(1), failed(2)], now)).toBe("Last 2 deliveries failed · 500");
  });

  it("says when nothing was delivered yet", () => {
    expect(lastDeliveryText([], now)).toBe("No deliveries yet");
    expect(lastDeliveryText([queued(0)], now)).toBe("Delivery queued");
  });
});

describe("responsePill", () => {
  it("labels status codes and missing responses", () => {
    expect(responsePill(ok(1))).toEqual({ label: "200 OK", tone: "success" });
    expect(responsePill(failed(1))).toEqual({ label: "500 Error", tone: "danger" });
    expect(responsePill(failed(1, null))).toEqual({ label: "No response", tone: "danger" });
    expect(responsePill(queued(0))).toEqual({ label: "Pending", tone: "muted" });
    expect(responsePill({ status: "success", attempts: 1, responseStatus: null })).toEqual({ label: "OK", tone: "success" });
  });
});

describe("attemptText", () => {
  it("shows attempts and the retry state", () => {
    expect(attemptText(ok(1), 11)).toBe("1");
    expect(attemptText(retrying(1), 11)).toBe("2 of 11 · retrying");
    expect(attemptText(failed(1), 11)).toBe("11 of 11 · gave up");
    expect(attemptText({ status: "failed", attempts: 1, error: "blocked" }, 11)).toBe("1 · not retried");
    expect(attemptText(queued(0), 11)).toBe("Queued");
  });
});

describe("deliveredPercent / endpointHost", () => {
  it("rounds down and is null without settled deliveries", () => {
    expect(deliveredPercent({ success: 199, failed: 1 })).toBe(99);
    expect(deliveredPercent({ success: 3, failed: 0 })).toBe(100);
    expect(deliveredPercent({ success: 0, failed: 0 })).toBeNull();
  });

  it("shows the host of an endpoint", () => {
    expect(endpointHost("https://hooks.example.com:8443/x?y")).toBe("hooks.example.com:8443");
    expect(endpointHost("nope")).toBe("nope");
  });
});

describe("deliveryWhen / deliveryRow", () => {
  const prefs = { locale: "en-GB", timeZone: "Europe/Berlin", hour12: false };

  it("shows the time today, 'Yesterday' and a short date before", () => {
    expect(deliveryWhen(Date.parse("2026-09-30T08:05:00Z"), now, prefs)).toBe("10:05");
    expect(deliveryWhen(Date.parse("2026-09-29T08:05:00Z"), now, prefs)).toBe("Yesterday 10:05");
    expect(deliveryWhen(Date.parse("2026-09-27T14:15:00Z"), now, prefs)).toBe("27 Sept 16:15");
  });

  it("formats a failed delivery for the log", () => {
    const row = deliveryRow({ ...failed(0), id: "d1", url: "https://crm.acme.dev/api", trigger: "BOOKING_CREATED", latencyMs: 1204 }, { now, prefs, maxAttempts: 11 });
    expect(row).toEqual({
      id: "d1",
      when: "14:00",
      whenIso: "2026-09-30T12:00:00.000Z",
      trigger: "BOOKING_CREATED",
      endpoint: "crm.acme.dev",
      response: { label: "500 Error", tone: "danger" },
      duration: "1,204 ms",
      attempt: "11 of 11 · gave up",
      failed: true,
      retryable: true,
    });
  });

  it("marks retrying deliveries failed but not retryable, and shows missing latency", () => {
    const row = deliveryRow({ ...retrying(1), id: "d2", url: "https://x.dev", trigger: "PING", latencyMs: null }, { now, prefs, maxAttempts: 11 });
    expect(row).toMatchObject({ failed: true, retryable: false, duration: "—", attempt: "2 of 11 · retrying" });
  });
});
