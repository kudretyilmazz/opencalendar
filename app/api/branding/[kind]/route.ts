import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/db/client";
import { assetHeaders } from "@/features/instance/assets";
import { ASSET_KINDS, type AssetKind } from "@/features/instance/defaults";
import { getAsset, getInstanceSettings } from "@/features/instance/server/service";
import { errorSummary, logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

let defaultFavicon: Promise<{ bytes: Buffer; mimeType: string; sha256: string } | null> | undefined;

/** The built-in favicon, shipped in public/ (the standalone image copies it). */
function builtInFavicon() {
  defaultFavicon ??= readFile(path.join(process.cwd(), "public/brand/default-favicon.ico")).then((bytes) => ({
    bytes,
    mimeType: "image/x-icon",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  })).catch((error: unknown) => {
    logger.error("branding.default_favicon_missing", errorSummary(error));
    defaultFavicon = undefined;
    return null;
  });
  return defaultFavicon;
}

/** Public branding images (ADM-011): uploaded bytes from PostgreSQL, else the built-in default. */
export async function GET(request: Request, ctx: RouteContext<"/api/branding/[kind]">) {
  const { kind: raw } = await ctx.params;
  const kind = ASSET_KINDS.find((k) => k === raw) as AssetKind | undefined;
  if (!kind) return new Response("Not found", { status: 404 });

  const db = getDb();
  const version = new URL(request.url).searchParams.get("v");
  // Revalidation (browsers, crawlers hitting /favicon.ico) is answered from the cached settings,
  // without reading the image bytes.
  const known = (await getInstanceSettings(db)).assets[kind];
  if (known && request.headers.get("if-none-match") === `"${known.sha256}"`) {
    return new Response(null, { status: 304, headers: assetHeaders(known, version) });
  }

  const asset = (await getAsset(db, kind)) ?? (kind === "favicon" ? await builtInFavicon() : null);
  if (!asset) return new Response("Not found", { status: 404 });

  const headers = assetHeaders(asset, version);
  if (request.headers.get("if-none-match") === headers.etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(asset.bytes), { headers });
}
