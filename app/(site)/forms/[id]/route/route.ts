import { getDb } from "@/db/client";
import { rawAnswersFromParams } from "@/features/routing-forms/schemas";
import { getPublicForm, RoutingError, submitResponse } from "@/features/routing-forms/server/service";
import { clientIp, overLimit } from "@/lib/security/public-limits";

export const dynamic = "force-dynamic";

const see = (location: string) => new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } });

/** Browser prefetches and link previews must not store responses (a GET with a side effect). */
const isPrefetch = (headers: Headers) => /prefetch|prerender/i.test(`${headers.get("sec-purpose") ?? ""} ${headers.get("purpose") ?? ""} ${headers.get("x-purpose") ?? ""}`);

/**
 * Headless routing (RTE-006): answers come from URL parameters, the response is stored and the
 * visitor is redirected straight to the target. A relative Location keeps working behind proxies.
 * Invalid answers fall back to the interactive form with the parameters as prefill.
 */
export async function GET(request: Request, ctx: RouteContext<"/forms/[id]/route">) {
  const { id } = await ctx.params;
  if ((await overLimit("routing", clientIp(request.headers))) || (await overLimit("routingForm", id.slice(0, 64)))) {
    return new Response("Too many requests", { status: 429 });
  }
  const db = getDb();
  const form = await getPublicForm(db, id);
  if (!form) return new Response("Not found", { status: 404 });

  const search = new URL(request.url).searchParams;
  const params: Record<string, string[]> = {};
  for (const key of new Set(search.keys())) params[key] = search.getAll(key);
  const query = search.toString();
  // A prefetch only gets the interactive form; the real navigation stores and routes.
  if (isPrefetch(request.headers)) return see(`/forms/${encodeURIComponent(id)}${query ? `?${query}` : ""}`);
  try {
    const { responseId, target } = await submitResponse(db, id, rawAnswersFromParams(form.fields, params));
    return see(target.kind === "redirect" ? target.url : `/forms/${encodeURIComponent(id)}?message=${encodeURIComponent(responseId)}`);
  } catch (error) {
    if (error instanceof RoutingError) {
      return error.code === "INVALID_ANSWERS" ? see(`/forms/${encodeURIComponent(id)}${query ? `?${query}` : ""}`) : new Response("Not found", { status: 404 });
    }
    throw error;
  }
}
