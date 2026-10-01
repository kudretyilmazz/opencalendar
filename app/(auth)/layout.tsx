import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/logo";
import { SourceFooter } from "@/components/source-footer";
import { getDb } from "@/db/client";
import { getInstanceSettings } from "@/features/instance/server/service";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const { loginMessage } = await getInstanceSettings(getDb());
  return (
    <>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
        <BrandLogo href="/" className="text-lg" />
        {/* Admin-set notice (ADM-009), plain text: React escapes it. */}
        {loginMessage && (
          <p data-testid="login-message" className="max-w-sm text-center text-sm whitespace-pre-line text-muted-foreground">
            {loginMessage}
          </p>
        )}
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <SourceFooter />
    </>
  );
}
