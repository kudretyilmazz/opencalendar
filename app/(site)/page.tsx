import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  if (await getSession()) redirect("/dashboard");
  const { deleted } = await searchParams;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 text-center">
      {deleted && (
        <Alert className="w-auto">
          <AlertDescription>Your account and its data were deleted.</AlertDescription>
        </Alert>
      )}
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">Scheduling you can host yourself</h1>
        <p className="text-muted-foreground">
          OpenCalendar is an open-source alternative to Calendly and Cal.com. Share a link, let people book time with
          you, and keep your data on your own server.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild size="lg" className="h-10 px-5">
          <Link href="/signup">Get started</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="h-10 px-5">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
