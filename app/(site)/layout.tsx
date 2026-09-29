import { headers } from "next/headers";
import type { ReactNode } from "react";
import { SourceFooter } from "@/components/source-footer";

/** Public pages (home, booking pages, confirmations, forms): the source footer, except when embedded. */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const embedded = (await headers()).get("x-opencal-embed") === "1";
  return (
    <>
      {children}
      {!embedded && <SourceFooter />}
    </>
  );
}
