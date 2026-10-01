"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { SettingsSection, settingsCardClass } from "@/features/settings/components/settings-section";
import { type ActionState, idle } from "@/lib/actions";
import { cn } from "@/lib/cn";
import { ASSET_RULES } from "../assets";
import type { AssetKind } from "../defaults";
import { resetAssetAction, uploadAssetAction } from "../server/actions";

type AssetSlot = { kind: AssetKind; label: string; hint: string; url: string | null; dark?: boolean };

const ACCEPT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg,.jpeg",
  "image/webp": ".webp",
  "image/x-icon": ".ico",
  "image/svg+xml": ".svg",
};

function AssetRow({ slot }: { slot: AssetSlot }) {
  const [uploadState, upload, uploading] = useActionState<ActionState, FormData>(uploadAssetAction, idle);
  const [resetState, reset, resetting] = useActionState<ActionState, FormData>(resetAssetAction, idle);
  const rule = ASSET_RULES[slot.kind];
  const message = uploadState.status === "error" ? uploadState.message : resetState.status === "error" ? resetState.message : undefined;
  const inputId = `asset-${slot.kind}`;
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center md:px-6">
      <div
        className={cn(
          "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border",
          slot.dark ? "bg-[#0b0f17]" : "bg-background",
        )}
      >
        {slot.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview of our own branding route
          <img src={slot.url} alt={`Current ${slot.label.toLowerCase()}`} className="max-h-14 max-w-14 object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">Default</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium">
          {slot.label}
        </label>
        <span className="text-[13px] text-muted-foreground">
          {slot.hint} {rule.types.map((t) => ACCEPT[t].split(",")[0].slice(1).toUpperCase()).join(", ")}, up to {rule.maxBytes / 1024} KB.
        </span>
        {message && <FieldError>{message}</FieldError>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <form action={upload} className="flex items-center gap-2">
          <input type="hidden" name="kind" value={slot.kind} />
          <input
            id={inputId}
            type="file"
            name="file"
            required
            accept={rule.types.map((t) => ACCEPT[t]).join(",")}
            className="max-w-52 text-[13px] file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1.5 file:text-[13px]"
          />
          <Button type="submit" variant="outline" disabled={uploading} className="h-9">
            {uploading && <Spinner />}
            Upload
          </Button>
        </form>
        {slot.url && (
          <form action={reset}>
            <input type="hidden" name="kind" value={slot.kind} />
            <Button type="submit" variant="ghost" disabled={resetting} className="h-9">
              Use default
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

/** Logo and icon uploads, each with its own form (they save immediately, not with the page). */
export function AssetUploads({ slots }: { slots: AssetSlot[] }) {
  return (
    <SettingsSection id="images" title="Logo and icons" description="Uploads take effect immediately. Images are stored in the database.">
      <div className={cn(settingsCardClass, "divide-y divide-border")}>
        {slots.map((slot) => (
          <AssetRow key={slot.kind} slot={slot} />
        ))}
      </div>
    </SettingsSection>
  );
}
