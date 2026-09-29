"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Alert, Button, Card, Field, Input } from "@/components/ui/primitives";
import { authClient } from "@/lib/auth/client";

type Status = { tone: "error" | "success"; message: string } | null;

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
          variant="secondary"
          onClick={() => authClient.signIn.social({ provider, callbackURL: next })}
        >
          Continue with {PROVIDER_LABELS[provider]}
        </Button>
      ))}
      <div className="my-2 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
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
    <Card className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted">Welcome back.</p>
      </div>
      <SocialButtons providers={providers} next={next} />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        {mode === "password" && (
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
        )}
        {status && <Alert tone={status.tone}>{status.message}</Alert>}
        <Button type="submit" disabled={pending}>
          {pending ? "Please wait…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}
        </Button>
      </form>
      <div className="flex flex-col gap-2 text-center text-sm">
        <button type="button" className="text-muted underline-offset-4 hover:underline" onClick={() => setMode(mode === "password" ? "magic" : "password")}>
          {mode === "password" ? "Sign in with an email link instead" : "Sign in with a password instead"}
        </button>
        <Link href="/forgot-password" className="text-muted underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
        <p className="text-muted">
          No account?{" "}
          <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
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
    <Card className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Create your account</h1>
        <p className="text-sm text-muted">Start sharing your booking link in minutes.</p>
      </div>
      <SocialButtons providers={providers} />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required maxLength={100} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 10 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </Field>
        {status && <Alert tone={status.tone}>{status.message}</Alert>}
        <Button type="submit" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
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
    <Card className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <p className="text-sm text-muted">We&apos;ll email you a link to choose a new one.</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        {status && <Alert tone={status.tone}>{status.message}</Alert>}
        <Button type="submit" disabled={pending}>
          Send reset link
        </Button>
      </form>
      <Link href="/login" className="text-center text-sm text-muted underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </Card>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const { pending, status, run } = useSubmit();
  if (!token) return <Alert tone="error">This reset link is invalid or has expired. Request a new one.</Alert>;

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
    <Card className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="New password" htmlFor="password" hint="At least 10 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </Field>
        {status && <Alert tone={status.tone}>{status.message}</Alert>}
        <Button type="submit" disabled={pending}>
          Update password
        </Button>
      </form>
    </Card>
  );
}
