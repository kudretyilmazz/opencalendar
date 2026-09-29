import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { durationsOf, type EventTypeView } from "@/features/event-types/server/service";
import { formatDuration } from "@/lib/format";
import { markdownToText } from "@/lib/markdown";

type Props = { heading: string; logoUrl?: string | null; basePath: string; eventTypes: EventTypeView[] };

/** The public list of bookable event types of a person, team or group (BKG-001, TEAM-001). */
export function EventTypeList({ heading, logoUrl, basePath, eventTypes }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="flex flex-col items-center gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- external logo URL, no optimizer config */}
        {logoUrl && <img src={logoUrl} alt="" className="h-12 w-12 rounded-full object-cover" referrerPolicy="no-referrer" />}
        <h1 className="text-2xl font-semibold">{heading}</h1>
        <p className="text-sm text-muted-foreground">Pick a meeting type to see available times.</p>
      </header>
      {eventTypes.length === 0 ? (
        <Card>
          <CardContent className="text-center text-muted-foreground">No meetings are available to book right now.</CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {eventTypes.map((et) => (
            <li key={et.id}>
              <Link href={`${basePath}/${et.slug}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="transition hover:ring-foreground/30">
                  <CardHeader>
                    <CardTitle>
                      <h2>{et.title}</h2>
                    </CardTitle>
                    <CardDescription>{durationsOf(et).map((d) => formatDuration(d, "en")).join(" / ")}</CardDescription>
                  </CardHeader>
                  {et.description && (
                    <CardContent>
                      <p className="line-clamp-2">{markdownToText(et.description)}</p>
                    </CardContent>
                  )}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
