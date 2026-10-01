import Link from "next/link";
import { getDb } from "@/db/client";
import { footerParts } from "@/features/instance/footer";
import { getInstanceSettings } from "@/features/instance/server/service";
import { getEnv } from "@/lib/env";

/**
 * AGPL-3.0 §13: everyone using the service over the network is offered the source code. The link
 * points at SOURCE_URL, so operators who modify OpenCalendar point it at their own fork. Admins
 * may hide the "Powered by" text and move the source link to /about (ADM-011); /about always
 * carries it.
 */
export async function SourceFooter() {
  const parts = footerParts(await getInstanceSettings(getDb()));
  if (!parts) return null;
  const linkClass = "underline underline-offset-4";
  return (
    <footer className="px-4 py-3 text-center text-xs text-muted-foreground">
      {parts.poweredBy && <>Powered by OpenCalendar · </>}
      {parts.source === "link" ? (
        <a href={getEnv().SOURCE_URL} className={linkClass} rel="noopener">
          Source code (AGPL-3.0)
        </a>
      ) : (
        <Link href="/about" className={linkClass}>
          About
        </Link>
      )}
    </footer>
  );
}
