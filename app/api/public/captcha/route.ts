import { getEnv } from "@/lib/env";
import { newChallenge } from "@/lib/security/captcha";
import { clientIp, overLocalLimit } from "@/lib/security/public-limits";

export const dynamic = "force-dynamic";

/** ALTCHA challenge for the booking form (ADM-007); 404 when the check is off. */
export async function GET(request: Request) {
  const env = getEnv();
  if (env.CAPTCHA !== "altcha") return Response.json({ error: "Not found" }, { status: 404 });
  if (overLocalLimit("slots", clientIp(request.headers))) return Response.json({ error: "Too many requests" }, { status: 429 });
  return Response.json(await newChallenge(env.AUTH_SECRET), { headers: { "cache-control": "no-store" } });
}
