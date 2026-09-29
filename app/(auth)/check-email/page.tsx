import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: PageProps<"/check-email">) {
  const { email } = await searchParams;
  return (
    <Card className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">Check your email</h1>
      <p className="text-sm text-muted">
        We sent a verification link{typeof email === "string" ? <> to <strong className="text-foreground">{email}</strong></> : null}.
        Click it to activate your account. The link expires in 24 hours.
      </p>
      <Link href="/login" className="text-sm font-medium underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </Card>
  );
}
