import { describe, expect, it } from "vitest";
import { bookingRedirectUrl } from "./redirect";

const b = { uid: "U1", title: "Intro", start: Date.parse("2026-10-05T09:00:00Z"), end: Date.parse("2026-10-05T09:30:00Z"), status: "accepted", eventSlug: "intro", name: "Grace", email: "g@x.test" };

describe("bookingRedirectUrl (EVT-016)", () => {
  it("keeps the host's parameters and appends booking details when asked", () => {
    const url = new URL(bookingRedirectUrl("https://example.com/thanks?ref=cal", true, b)!);
    expect(url.searchParams.get("ref")).toBe("cal");
    expect(url.searchParams.get("start")).toBe("2026-10-05T09:00:00.000Z");
    expect(url.searchParams.get("email")).toBe("g@x.test");
    expect(url.searchParams.has("token")).toBe(false);
  });

  it("forwards nothing unless enabled and refuses non-https targets", () => {
    expect(bookingRedirectUrl("https://example.com/thanks", false, b)).toBe("https://example.com/thanks");
    expect(bookingRedirectUrl("javascript:alert(1)", true, b)).toBeNull();
    expect(bookingRedirectUrl("http://example.com", true, b)).toBeNull();
    expect(bookingRedirectUrl("not a url", true, b)).toBeNull();
  });
});
