import Link from "next/link";
import { Card } from "@/components/ui/primitives";
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
        <p className="text-sm text-muted">Pick a meeting type to see available times.</p>
      </header>
      {eventTypes.length === 0 ? (
        <Card className="text-center text-sm text-muted">No meetings are available to book right now.</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {eventTypes.map((et) => (
            <li key={et.id}>
              <Link href={`${basePath}/${et.slug}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="p-4 transition hover:border-foreground/30">
                  <h2 className="font-medium">{et.title}</h2>
                  <p className="text-sm text-muted">{durationsOf(et).map((d) => formatDuration(d, "en")).join(" / ")}</p>
                  {et.description && <p className="mt-2 line-clamp-2 text-sm">{markdownToText(et.description)}</p>}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
