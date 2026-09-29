import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { SignupForm } from "@/features/auth/components/auth-forms";
import { enabledSocialProviders, isSignupOpen } from "@/features/auth/server/queries";
import { getSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");
  const env = getEnv();
  if (!(await isSignupOpen(getDb(), env))) {
    return (
      <Card className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Sign-ups are closed</h1>
        <p className="text-sm text-muted">
          {env.SIGNUP_MODE === "invite_only"
            ? "This instance is invite-only. Ask an administrator for an invitation."
            : "New accounts can't be created on this instance."}
        </p>
        <Link href="/login" className="text-sm font-medium underline-offset-4 hover:underline">
          Go to sign in
        </Link>
      </Card>
    );
  }
  return <SignupForm providers={enabledSocialProviders(env)} />;
}
