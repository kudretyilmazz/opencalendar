import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { listEventTypes } from "@/features/event-types/server/service";
import { getProfile } from "@/features/settings/server/service";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const user = await requireUser();
  const db = getDb();
  const [profile, eventTypes] = await Promise.all([getProfile(db, user.id), listEventTypes(db, user.id)]);

  const steps = [
    { done: Boolean(profile?.emailVerified), label: "Verify your email address" },
    { done: Boolean(profile?.username), label: "Choose a username for your booking page", href: "/settings/profile" },
    { done: profile?.timeZone !== "UTC", label: "Set your time zone", href: "/settings/profile" },
    { done: eventTypes.length > 0, label: "Create your first event type", href: "/event-types/new" },
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted">
          {user.role === "admin" ? "You are the administrator of this instance." : "Here's how to get started."}
        </p>
      </div>
      <Card>
        <h2 className="mb-4 font-medium">Getting started</h2>
        <ol className="flex flex-col gap-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden
                className={`flex size-5 items-center justify-center rounded-full border text-xs ${step.done ? "border-success bg-success text-white" : "border-border"}`}
              >
                {step.done ? "✓" : ""}
              </span>
              <span className="sr-only">{step.done ? "Done:" : "To do:"}</span>
              {step.href && !step.done ? (
                <Link href={step.href} className="underline-offset-4 hover:underline">
                  {step.label}
                </Link>
              ) : (
                <span className={step.done ? "text-muted line-through" : ""}>{step.label}</span>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
