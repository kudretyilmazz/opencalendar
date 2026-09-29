import nodemailer from "nodemailer";
import type { Env } from "@/lib/env";

export type CalendarPart = { method: "REQUEST" | "CANCEL" | "PUBLISH"; content: string };

export type OutgoingEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** iCalendar invitation, sent as a text/calendar part so clients show accept/update UI. */
  calendar?: CalendarPart;
};

/** Minimal mail-sending port so jobs can be tested without SMTP. */
export type Mailer = { send(email: OutgoingEmail): Promise<void> };

export function createSmtpMailer(
  env: Pick<Env, "SMTP_HOST" | "SMTP_PORT" | "SMTP_SECURE" | "SMTP_USER" | "SMTP_PASSWORD">,
): Mailer {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return {
    async send({ calendar, ...email }) {
      await transporter.sendMail({
        ...email,
        ...(calendar && {
          icalEvent: { method: calendar.method, filename: "invite.ics", content: calendar.content },
        }),
      });
    },
  };
}
