import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));
vi.mock("nodemailer", () => ({ default: { createTransport } }));

const { createSmtpMailer } = await import("./transport");

const email = { from: "a@x.test", to: "b@x.test", subject: "s", html: "<p>h</p>", text: "h" };

beforeEach(() => {
  sendMail.mockReset();
  createTransport.mockClear();
});

describe("createSmtpMailer", () => {
  it("configures SMTP without auth when no user is set", async () => {
    const mailer = createSmtpMailer({ SMTP_HOST: "smtp.x.test", SMTP_PORT: 1025, SMTP_SECURE: false, SMTP_USER: undefined, SMTP_PASSWORD: undefined });
    await mailer.send(email);
    expect(createTransport).toHaveBeenCalledWith({ host: "smtp.x.test", port: 1025, secure: false, auth: undefined });
    expect(sendMail).toHaveBeenCalledWith(email);
  });

  it("passes credentials when configured", () => {
    createSmtpMailer({ SMTP_HOST: "h", SMTP_PORT: 465, SMTP_SECURE: true, SMTP_USER: "u", SMTP_PASSWORD: "p" });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true, auth: { user: "u", pass: "p" } }));
  });

  it("propagates transport errors", async () => {
    sendMail.mockRejectedValue(new Error("boom"));
    const mailer = createSmtpMailer({ SMTP_HOST: "h", SMTP_PORT: 25, SMTP_SECURE: false, SMTP_USER: undefined, SMTP_PASSWORD: undefined });
    await expect(mailer.send(email)).rejects.toThrow("boom");
  });
});
