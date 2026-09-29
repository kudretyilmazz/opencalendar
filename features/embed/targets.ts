/**
 * Builds EmbedTargets from what the dashboard pages already load (usernames and team slugs come
 * from the database on the server). Each returns null when the link would not pass the loader's
 * calLink check, so an entry point simply hides its "Embed" action instead of emitting bad code.
 */
import { isValidCalLink } from "./cal-link";
import type { EmbedTarget } from "./target";

const SEGMENT = /^[\w-]+$/;

/** Every piece (username, slug, id) must be one path segment, so "a/b" can't shift the shape. */
function target(value: EmbedTarget, parts: readonly string[]): EmbedTarget | null {
  return parts.every((p) => SEGMENT.test(p)) && isValidCalLink(value.calLink) ? value : null;
}

const cleanDurations = (durations: readonly number[]) =>
  [...new Set(durations.filter((d) => Number.isInteger(d) && d > 0))].sort((a, b) => a - b);

/** A host's booking page listing their public event types. */
export function profileTarget(username: string | null | undefined, name: string): EmbedTarget | null {
  if (!username) return null;
  return target({ kind: "profile", calLink: username, label: name || username }, [username]);
}

/** One personal event type; enables the email embed. */
export function eventTypeTarget(
  username: string | null | undefined,
  et: { slug: string; title: string; durations: readonly number[] },
): EmbedTarget | null {
  if (!username) return null;
  return target(
    {
      kind: "eventType",
      calLink: `${username}/${et.slug}`,
      label: et.title,
      booking: { username, slug: et.slug, durations: cleanDurations(et.durations) },
    },
    [username, et.slug],
  );
}

/** A team's public page. */
export function teamTarget(team: { slug: string; name: string }): EmbedTarget | null {
  return target({ kind: "team", calLink: `team/${team.slug}`, label: team.name }, [team.slug]);
}

/** A round-robin or collective team event type. Managed ones have no team booking page. */
export function teamEventTypeTarget(
  teamSlug: string,
  et: { slug: string; title: string; durations: readonly number[]; schedulingType: string | null },
): EmbedTarget | null {
  if (et.schedulingType === "managed") return null;
  return target(
    {
      kind: "teamEventType",
      calLink: `team/${teamSlug}/${et.slug}`,
      label: et.title,
      booking: { team: teamSlug, slug: et.slug, durations: cleanDurations(et.durations) },
    },
    [teamSlug, et.slug],
  );
}

/** A routing form (RTE-006). */
export function formTarget(form: { id: string; name: string }): EmbedTarget | null {
  return target({ kind: "form", calLink: `forms/${form.id}`, label: form.name }, [form.id]);
}
