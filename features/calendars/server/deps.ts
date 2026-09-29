import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { user } from "@/db/schema";
import type { Cipher } from "@/lib/crypto/encryption";
import type { Env } from "@/lib/env";
import type { EmailRequest } from "@/lib/jobs/queues";
import { defaultFetchFor, type IntegrationDeps } from "./credentials";

/**
 * Production wiring of the integration layer. `sendEmail` queues an email (sealed by the caller's
 * enqueue function); used to tell owners when a connection stops working (INT-012).
 */
export function createIntegrationDeps(input: {
  db: Database;
  env: Env;
  cipher: Cipher;
  sendEmail: (email: EmailRequest) => Promise<void>;
}): IntegrationDeps {
  return {
    db: input.db,
    env: input.env,
    cipher: input.cipher,
    fetchFor: defaultFetchFor(input.env),
    now: () => Date.now(),
    async onCredentialInvalid({ userId, provider, label }) {
      const [owner] = await input.db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId));
      if (!owner) return;
      await input.sendEmail({
        to: owner.email,
        template: "integration-error",
        props: { name: owner.name, provider: provider.name, account: label, url: `${input.env.APP_URL}/settings/calendars` },
      });
    },
  };
}
