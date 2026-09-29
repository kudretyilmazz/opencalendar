import { expect } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

type MessageSummary = { ID: string; Subject: string; To: { Address: string }[] };
export type Email = { id: string; subject: string; text: string; raw: string };

/** Waits for the newest email to `to` whose subject matches and returns its text and raw source. */
export async function waitForEmail(to: string, subject: RegExp): Promise<Email> {
  let found: Email | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        const { messages } = (await res.json()) as { messages: MessageSummary[] };
        const message = messages.find((m) => subject.test(m.Subject));
        if (!message) return undefined;
        const detail = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`)).json()) as { Text: string };
        const raw = await (await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}/raw`)).text();
        found = { id: message.ID, subject: message.Subject, text: detail.Text, raw };
        return found;
      },
      { timeout: 30_000, message: `email "${subject}" to ${to}` },
    )
    .toBeTruthy();
  return found!;
}

/** First link in the newest matching email, optionally the first one matching `pattern`. */
export async function waitForEmailLink(to: string, subject: RegExp, pattern = /https?:\/\/\S+/): Promise<string> {
  const email = await waitForEmail(to, subject);
  const link = email.text.match(new RegExp(pattern.source.replace(/^\^/, "")))?.[0];
  expect(link, `link matching ${pattern} in "${email.subject}"`).toBeTruthy();
  return link!.replace(/[)\]>.,]+$/, "");
}

export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
