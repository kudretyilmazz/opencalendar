import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  if (await getSession()) redirect("/dashboard");
  const { deleted } = await searchParams;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 text-center">
      {deleted && (
        <p role="status" className="rounded-md border border-border bg-accent px-3 py-2 text-sm">
          Your account and its data were deleted.
        </p>
      )}
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">Scheduling you can host yourself</h1>
        <p className="text-muted">
          OpenCalendar is an open-source alternative to Calendly and Cal.com. Share a link, let people book time with
          you, and keep your data on your own server.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/signup" className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground">
          Get started
        </Link>
        <Link href="/login" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-5 text-sm font-medium">
          Sign in
        </Link>
      </div>
    </main>
  );
}
