import { describe, expect, it, vi } from "vitest";
import { createCipher } from "@/lib/crypto/encryption";
import type { Mailer, OutgoingEmail } from "@/lib/email/transport";
import { emailJobPayload, openEmail, sealEmail } from "@/lib/jobs/queues";
import { DEFAULT_EMAIL_BRANDING } from "@/features/instance/email-branding";
import { createEmailSendHandler } from "./email-send";

const cipher = createCipher({ current: Buffer.alloc(32, 4).toString("base64") });
const job = (data: unknown, id = "job-1") => ({ id, data }) as never;
const magic = (url = "https://x.test/m?token=secret-token") =>
  sealEmail(cipher, { to: "a@b.test", template: "magic-link", props: { url } });

describe("sealEmail / openEmail", () => {
  it("round-trips the request and hides the props", () => {
    const sealed = magic();
    expect(emailJobPayload.parse(sealed)).toEqual(sealed);
    expect(JSON.stringify(sealed)).not.toContain("secret-token");
    expect(openEmail(cipher, sealed)).toEqual({
      to: "a@b.test",
      template: "magic-link",
      props: { url: "https://x.test/m?token=secret-token" },
    });
  });

  it("rejects invalid recipients and content before sealing", () => {
    expect(() => sealEmail(cipher, { to: "nope", template: "magic-link", props: { url: "https://x" } })).toThrow();
    expect(() => sealEmail(cipher, { to: "a@b.test", template: "magic-link", props: { url: "not a url" } })).toThrow();
    expect(() =>
      sealEmail(cipher, { to: "a@b.test", template: "verify-email", props: { name: "x".repeat(201), url: "https://x" } }),
    ).toThrow();
  });

  it("refuses payloads whose template does not match the sealed props", () => {
    const sealed = magic();
    expect(() => openEmail(cipher, { ...sealed, template: "verify-email" })).toThrow();
  });

  it("refuses payloads sealed with another key", () => {
    const other = createCipher({ current: Buffer.alloc(32, 8).toString("base64") });
    expect(() => openEmail(other, magic())).toThrow();
  });
});

describe("createEmailSendHandler", () => {
  it("opens, renders and sends each job with the configured sender", async () => {
    const sent: OutgoingEmail[] = [];
    const mailer: Mailer = { send: async (m) => void sent.push(m) };
    const handler = createEmailSendHandler({ mailer, from: "OpenCalendar <no-reply@x.test>", cipher });

    await handler([job(magic("https://x.test/m"))]);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "a@b.test", from: "OpenCalendar <no-reply@x.test>" });
    expect(sent[0].html).toContain("https://x.test/m");
  });

  it("renders with the instance branding when one is provided", async () => {
    const sent: OutgoingEmail[] = [];
    const mailer: Mailer = { send: async (m) => void sent.push(m) };
    const branding = vi.fn().mockResolvedValue({ ...DEFAULT_EMAIL_BRANDING, appName: "Acme Meet" });
    const handler = createEmailSendHandler({ mailer, from: "x@x.test", cipher, branding });

    await handler([job(magic())]);

    expect(branding).toHaveBeenCalledOnce();
    expect(sent[0].html).toContain("Sign in to Acme Meet");
  });

  it("rethrows transport failures so pg-boss retries the job", async () => {
    const mailer: Mailer = { send: vi.fn().mockRejectedValue(new Error("SMTP down")) };
    const handler = createEmailSendHandler({ mailer, from: "x@x.test", cipher });
    await expect(handler([job(magic())])).rejects.toThrow("SMTP down");
  });

  it("fails fast on an invalid payload", async () => {
    const mailer: Mailer = { send: vi.fn() };
    const handler = createEmailSendHandler({ mailer, from: "x@x.test", cipher });
    await expect(handler([job({ to: "bad" })])).rejects.toThrow();
    expect(mailer.send).not.toHaveBeenCalled();
  });
});

describe("email job payload templates", () => {
  it("accepts every template the content schema knows", async () => {
    const { emailContent, emailJobPayload } = await import("@/lib/jobs/queues");
    for (const option of emailContent.options) {
      expect(emailJobPayload.safeParse({ to: "a@b.test", template: option.shape.template.value, sealed: "x" }).success).toBe(true);
    }
  });
});
