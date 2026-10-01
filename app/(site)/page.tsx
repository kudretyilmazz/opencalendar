import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { getInstanceSettings } from "@/features/instance/server/service";
import { getSession } from "@/lib/auth/session";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  if (await getSession()) redirect("/dashboard");
  const [{ deleted }, settings] = await Promise.all([searchParams, getInstanceSettings(getDb())]);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 text-center">
      {deleted && (
        <Alert className="w-auto">
          <AlertDescription>Your account and its data were deleted.</AlertDescription>
        </Alert>
      )}
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">{settings.landingHeadline}</h1>
        <p className="whitespace-pre-line text-muted-foreground">{settings.landingBody}</p>
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
