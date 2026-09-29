import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { checkReadiness } from "@/lib/health";
import { getProducer } from "@/lib/jobs/boss";

export const dynamic = "force-dynamic";

/** Readiness (ADM-004): database and job queue reachable. 503 when not ready. */
export async function GET() {
  const readiness = await checkReadiness(getDb(), async () => (await getProducer(getEnv().DATABASE_URL)).isInstalled());
  return Response.json(
    { status: readiness.ok ? "ok" : "unavailable", checks: readiness.checks },
    { status: readiness.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
