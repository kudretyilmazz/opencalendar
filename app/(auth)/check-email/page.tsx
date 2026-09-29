import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: PageProps<"/check-email">) {
  const { email } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl font-semibold">Check your email</h1>
        </CardTitle>
        <CardDescription>
          We sent a verification link{typeof email === "string" ? <> to <strong className="text-foreground">{email}</strong></> : null}.
          Click it to activate your account. The link expires in 24 hours.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="link" className="px-0">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
