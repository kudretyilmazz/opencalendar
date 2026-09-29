import pkg from "@/package.json";

export const dynamic = "force-dynamic";

/** Liveness (ADM-004): the process is up and serving requests. Reports the running version. */
export function GET() {
  return Response.json({ status: "ok", version: pkg.version }, { headers: { "cache-control": "no-store" } });
}
