"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";

type Status = { tone: "error" | "success"; message: string } | null;

function StatusAlert({ status }: { status: NonNullable<Status> }) {
  return (
    <Alert variant={status.tone === "error" ? "destructive" : "success"}>
      <AlertDescription>{status.message}</AlertDescription>
    </Alert>
  );
}

function AuthCardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <CardHeader>
      <CardTitle>
        <h1 className="text-xl font-semibold">{title}</h1>
      </CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </CardHeader>
  );
}

const formValue = (event: FormEvent<HTMLFormElement>, name: string) =>
  String(new FormData(event.currentTarget).get(name) ?? "");

function errorMessage(error: { status?: number; message?: string; code?: string } | null): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.status === 403 && error.code === "EMAIL_NOT_VERIFIED") return "Please verify your email first. We sent you a new link.";
  if (error.status === 429) return error.message || "Too many attempts. Please wait a moment and try again.";
  return error.message || "Something went wrong. Please try again.";
}

function useSubmit() {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const run = async (action: () => Promise<Status>) => {
    setPending(true);
    setStatus(null);
    try {
      setStatus(await action());
    } catch {
      setStatus({ tone: "error", message: "Network error. Please try again." });
    } finally {
      setPending(false);
    }
  };
  return { pending, status, run };
}

export type SocialProvider = "google" | "microsoft";
const PROVIDER_LABELS: Record<SocialProvider, string> = { google: "Google", microsoft: "Microsoft" };

function SocialButtons({ providers, next = "/dashboard" }: { providers: SocialProvider[]; next?: string }) {
  if (providers.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {providers.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          onClick={() => authClient.signIn.social({ provider, callbackURL: next })}
        >
          Continue with {PROVIDER_LABELS[provider]}
        </Button>
      ))}
      <div className="my-2 flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" /> or <Separator className="flex-1" />
      </div>
    </div>
  );
}

export function LoginForm({ providers, next = "/dashboard" }: { providers: SocialProvider[]; next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "magic">("password");
  const { pending, status, run } = useSubmit();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = formValue(event, "email");
    if (mode === "magic") {
      return run(async () => {
        const { error } = await authClient.signIn.magicLink({ email, callbackURL: next });
        return error
          ? { tone: "error", message: errorMessage(error) }
          : { tone: "success", message: "Check your inbox for a sign-in link. It expires in 15 minutes." };
      });
    }
    return run(async () => {
      const { error } = await authClient.signIn.email({ email, password: formValue(event, "password"), callbackURL: next });
      if (error) return { tone: "error", message: errorMessage(error) };
      router.push(next);
      router.refresh();
      return null;
    });
  };

  return (
    <Card>
      <AuthCardHeader title="Sign in" description="Welcome back." />
      <CardContent className="flex flex-col gap-5">
        <SocialButtons providers={providers} next={next} />
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </FormField>
          {mode === "password" && (
            <FormField label="Password" htmlFor="password">
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </FormField>
          )}
          {status && <StatusAlert status={status} />}
          <Button type="submit" disabled={pending}>
            {pending && <Spinner />}
            {pending ? "Please wait…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}
          </Button>
        </form>
        <div className="flex flex-col items-center gap-1 text-center text-sm">
          <Button type="button" variant="link" className="text-muted-foreground" onClick={() => setMode(mode === "password" ? "magic" : "password")}>
            {mode === "password" ? "Sign in with an email link instead" : "Sign in with a password instead"}
          </Button>
          <Button asChild variant="link" className="text-muted-foreground">
            <Link href="/forgot-password">Forgot your password?</Link>
          </Button>
          <p className="text-muted-foreground">
            No account?{" "}
            <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function SignupForm({ providers }: { providers: SocialProvider[] }) {
  const router = useRouter();
  const { pending, status, run } = useSubmit();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = formValue(event, "email");
    return run(async () => {
      const { error } = await authClient.signUp.email({
        name: formValue(event, "name"),
        email,
        password: formValue(event, "password"),
        callbackURL: "/dashboard",
      });
      if (error) return { tone: "error", message: errorMessage(error) };
      router.push(`/check-email?email=${encodeURIComponent(email)}`);
      return null;
    });
  };

  return (
    <Card>
      <AuthCardHeader title="Create your account" description="Start sharing your booking link in minutes." />
      <CardContent className="flex flex-col gap-5">
        <SocialButtons providers={providers} />
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField label="Name" htmlFor="name">
            <Input id="name" name="name" autoComplete="name" required maxLength={100} />
          </FormField>
          <FormField label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </FormField>
          <FormField label="Password" htmlFor="password" hint="At least 10 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
          </FormField>
          {status && <StatusAlert status={status} />}
          <Button type="submit" disabled={pending}>
            {pending && <Spinner />}
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export function ForgotPasswordForm() {
  const { pending, status, run } = useSubmit();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = formValue(event, "email");
    return run(async () => {
      const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      return error
        ? { tone: "error", message: errorMessage(error) }
        : { tone: "success", message: "If an account exists for that email, we sent a reset link. It expires in 60 minutes." };
    });
  };
  return (
    <Card>
      <AuthCardHeader title="Reset your password" description="We'll email you a link to choose a new one." />
      <CardContent className="flex flex-col gap-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </FormField>
          {status && <StatusAlert status={status} />}
          <Button type="submit" disabled={pending}>
            {pending && <Spinner />}
            Send reset link
          </Button>
        </form>
        <Button asChild variant="link" className="self-center text-muted-foreground">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const { pending, status, run } = useSubmit();
  if (!token) return <StatusAlert status={{ tone: "error", message: "This reset link is invalid or has expired. Request a new one." }} />;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return run(async () => {
      const { error } = await authClient.resetPassword({ token, newPassword: formValue(event, "password") });
      if (error) return { tone: "error", message: errorMessage(error) };
      router.push("/login?reset=1");
      return null;
    });
  };
  return (
    <Card>
      <AuthCardHeader title="Choose a new password" />
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField label="New password" htmlFor="password" hint="At least 10 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
          </FormField>
          {status && <StatusAlert status={status} />}
          <Button type="submit" disabled={pending}>
            {pending && <Spinner />}
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
