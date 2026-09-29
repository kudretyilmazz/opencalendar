import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { DecisionForm } from "@/features/bookings/components/decision-form";
import { LocalTime } from "@/features/bookings/components/manage-booking";
import { findBookingByUid } from "@/features/bookings/server/service";
import { requestTime } from "@/lib/clock";
import { getEnv } from "@/lib/env";
import { verifyAction } from "@/lib/security/signed-links";

// The URL carries a signature: never send it as a referrer, never index it.
export const metadata: Metadata = { title: "Confirm booking request", robots: { index: false }, referrer: "no-referrer" };

/**
 * Landing page of the one-click links in the host's request email (BKG-012). Opening it changes
 * nothing (mail scanners follow links); the host confirms with a button, and the server action
 * verifies the signature.
 */
export default async function DecidePage({ params, searchParams }: PageProps<"/booking/[uid]/decide">) {
  const { uid } = await params;
  const query = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const action = one(query.action) === "reject" ? "reject" : "accept";
  const exp = one(query.exp);
  const sig = one(query.sig);
  const found = await findBookingByUid(getDb(), uid);
  if (!found || !exp || !sig) notFound();
  // Only a valid signature may see who booked (the uid alone is not a secret).
  const valid = verifyAction(getEnv().AUTH_SECRET, { subject: found.booking.id, action, expiresAt: Number(exp) }, sig, requestTime());
  if (!valid) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-12">
        <Alert variant="destructive">
          <AlertDescription>This link is invalid or has expired. Open your bookings dashboard to accept or reject requests.</AlertDescription>
        </Alert>
      </main>
    );
  }
  const { booking: b, attendees } = found;
  const booker = attendees.find((a) => !a.isGuest) ?? attendees[0];

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-12">
      <Card className="[--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl font-semibold">Booking request</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">What</dt>
          <dd className="font-medium">{b.title}</dd>
          <dt className="text-muted-foreground">When</dt>
          <dd>
            <LocalTime start={b.startAt.getTime()} end={b.endAt.getTime()} />
          </dd>
          <dt className="text-muted-foreground">Invitee</dt>
          <dd>
            {booker?.name} ({booker?.email})
          </dd>
        </dl>
        {b.status === "pending" ? (
          <DecisionForm signed={{ uid, exp, sig }} initial={action} />
        ) : (
          <Alert>
            <AlertDescription>This request was already {b.status === "accepted" ? "accepted" : b.status === "rejected" ? "rejected" : "cancelled"}.</AlertDescription>
          </Alert>
        )}
        </CardContent>
      </Card>
    </main>
  );
}
