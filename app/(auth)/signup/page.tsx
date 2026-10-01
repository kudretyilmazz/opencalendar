import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { SignupForm } from "@/features/auth/components/auth-forms";
import { effectiveSignupMode, isSignupOpen, visibleSocialProviders } from "@/features/auth/server/queries";
import { getSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");
  const env = getEnv();
  const db = getDb();
  if (!(await isSignupOpen(db, env))) {
    const mode = await effectiveSignupMode(db, env);
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl font-semibold">Sign-ups are closed</h1>
          </CardTitle>
          <CardDescription>
            {mode === "invite_only"
              ? "This instance is invite-only. Ask an administrator for an invitation."
              : "New accounts can't be created on this instance."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="link" className="px-0">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return <SignupForm providers={await visibleSocialProviders(db, env)} />;
}
