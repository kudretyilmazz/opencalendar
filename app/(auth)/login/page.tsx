import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoginForm } from "@/features/auth/components/auth-forms";
import { getDb } from "@/db/client";
import { visibleSocialProviders } from "@/features/auth/server/queries";
import { getSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/security/redirect";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, { tone: "success" | "error"; text: string }> = {
  reset: { tone: "success", text: "Your password was updated. Sign in with your new password." },
  disabled: { tone: "error", text: "This account has been disabled." },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  // `next` comes from proxy.ts; only same-origin paths are honored (no open redirect).
  const next = safeRedirectPath(params.next);
  const session = await getSession();
  // A disabled user's leftover session must not bounce between /login and requireUser().
  if (session && !session.user.disabledAt) redirect(next);
  const notice = params.reset ? NOTICES.reset : params.error === "disabled" ? NOTICES.disabled : null;
  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <Alert variant={notice.tone === "error" ? "destructive" : "success"}>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}
      <LoginForm providers={await visibleSocialProviders(getDb(), getEnv())} next={next} />
    </div>
  );
}
