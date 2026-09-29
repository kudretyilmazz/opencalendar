import { describe, expect, it } from "vitest";
import { renderEmail } from "./templates";

describe("renderEmail", () => {
  it("renders the verification email with the link in html and text", async () => {
    const email = await renderEmail({
      template: "verify-email",
      props: { name: "Ada", url: "https://cal.example.com/api/auth/verify-email?token=abc" },
    });
    expect(email.subject).toMatch(/verify/i);
    expect(email.html).toContain("https://cal.example.com/api/auth/verify-email?token=abc");
    expect(email.text).toContain("https://cal.example.com/api/auth/verify-email?token=abc");
    expect(email.html).toContain("Ada");
  });

  it("renders the reset-password email and states the expiry", async () => {
    const email = await renderEmail({
      template: "reset-password",
      props: { name: "Ada", url: "https://x.test/reset?token=1" },
    });
    expect(email.subject).toMatch(/reset/i);
    expect(email.text).toMatch(/60 minutes/);
  });

  it("renders the magic-link email and states the expiry", async () => {
    const email = await renderEmail({ template: "magic-link", props: { url: "https://x.test/m?token=1" } });
    expect(email.subject).toMatch(/sign in/i);
    expect(email.text).toMatch(/15 minutes/);
  });

  it("renders the integration-error email with a reconnect link", async () => {
    const email = await renderEmail({
      template: "integration-error",
      props: { name: "Ada", provider: "Google Calendar", account: "ada@gmail.com", url: "https://x.test/settings/calendars" },
    });
    expect(email.subject).toMatch(/Reconnect Google Calendar/);
    expect(email.text).toContain("ada@gmail.com");
    expect(email.text).toContain("https://x.test/settings/calendars");
  });

  it("escapes user-controlled names", async () => {
    const email = await renderEmail({
      template: "verify-email",
      props: { name: "<script>alert(1)</script>", url: "https://x.test" },
    });
    expect(email.html).not.toContain("<script>alert(1)</script>");
  });
});
