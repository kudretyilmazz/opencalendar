import { getDb } from "@/db/client";
import { exportResponsesCsv, RoutingError } from "@/features/routing-forms/server/service";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** CSV export of a form's responses (RTE-005), for the form's managers only. */
export async function GET(_request: Request, ctx: RouteContext<"/api/routing-forms/[id]/responses">) {
  const user = await requireUser();
  const { id } = await ctx.params;
  try {
    const { filename, csv } = await exportResponsesCsv(getDb(), user.id, id);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof RoutingError) return new Response("Not found", { status: 404 });
    throw error;
  }
}
