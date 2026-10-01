"use server";

import { revalidatePath } from "next/cache";
import type { ZodType } from "zod";
import { getDb } from "@/db/client";
import { type ActionState, fieldErrors } from "@/lib/actions";
import { requireAdminAction } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { checkAsset } from "../assets";
import { ASSET_KINDS, type AssetKind } from "../defaults";
import { brandingSchema, emailSchema, platformSchema, themeSchema } from "../schemas";
import { deleteAsset, putAsset, type SettingsPatch, updateInstanceSettings } from "./service";

const FORBIDDEN: ActionState = { status: "error", message: "Only instance administrators can change these settings." };

/** authenticate (admin) → validate → save → refresh every page, since branding is everywhere. */
async function saveSection<T extends SettingsPatch>(schema: ZodType<T>, formData: FormData, section: string): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin) return FORBIDDEN;
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }
  await updateInstanceSettings(getDb(), parsed.data, admin.id);
  logger.info("instance.settings_updated", { section, actorId: admin.id });
  revalidatePath("/", "layout");
  return { status: "success", message: "Settings saved." };
}

export async function saveBrandingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return saveSection(brandingSchema, formData, "branding");
}

export async function saveThemeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return saveSection(themeSchema, formData, "theme");
}

export async function saveEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return saveSection(emailSchema, formData, "email");
}

export async function savePlatformAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return saveSection(platformSchema, formData, "platform");
}

function assetKind(value: FormDataEntryValue | null): AssetKind | null {
  return ASSET_KINDS.find((k) => k === value) ?? null;
}

export async function uploadAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin) return FORBIDDEN;
  const kind = assetKind(formData.get("kind"));
  const file = formData.get("file");
  if (!kind || !(file instanceof File)) return { status: "error", message: "Choose a file to upload." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkAsset(kind, bytes);
  if (!check.ok) return { status: "error", message: check.message, fieldErrors: { [kind]: check.message } };
  await putAsset(getDb(), kind, bytes, check.mimeType);
  logger.info("instance.asset_uploaded", { kind, mimeType: check.mimeType, size: bytes.byteLength, actorId: admin.id });
  revalidatePath("/", "layout");
  return { status: "success", message: "Image uploaded." };
}

export async function resetAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin) return FORBIDDEN;
  const kind = assetKind(formData.get("kind"));
  if (!kind) return { status: "error", message: "Unknown image." };
  await deleteAsset(getDb(), kind);
  logger.info("instance.asset_removed", { kind, actorId: admin.id });
  revalidatePath("/", "layout");
  return { status: "success", message: "Restored the default image." };
}
