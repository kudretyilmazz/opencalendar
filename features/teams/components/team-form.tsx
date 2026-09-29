"use client";

import { useState } from "react";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { slugify } from "@/features/event-types/schemas";
import type { ActionState } from "@/lib/actions";
import { PayloadForm } from "./payload-form";

type TeamValues = { name: string; slug: string; logoUrl: string; brandColor: string };

/** Create or edit a team (TEAM-001). */
export function TeamForm({
  initial,
  action,
  appUrl,
  submitLabel,
  stacked = false,
}: {
  initial?: TeamValues;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  appUrl: string;
  submitLabel: string;
  /** One field per row (narrow cards). */
  stacked?: boolean;
}) {
  const [values, setValues] = useState<TeamValues>(initial ?? { name: "", slug: "", logoUrl: "", brandColor: "" });
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const set = (patch: Partial<TeamValues>) => setValues((v) => ({ ...v, ...patch }));
  return (
    <PayloadForm action={action} payload={values} submitLabel={submitLabel}>
      {(errors) => (
        <div className={stacked ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
          <FormField label="Team name" htmlFor="team-name" error={errors.name}>
            <Input
              id="team-name"
              value={values.name}
              required
              maxLength={100}
              onChange={(e) => set({ name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
            />
          </FormField>
          <FormField
            label="Team URL"
            htmlFor="team-slug"
            error={errors.slug}
            hint={`${appUrl}/team/${values.slug || "…"}`}
          >
            <Input
              id="team-slug"
              value={values.slug}
              required
              maxLength={64}
              onChange={(e) => {
                setSlugTouched(true);
                set({ slug: e.target.value });
              }}
            />
          </FormField>
          {initial && (
            <>
              <FormField label="Logo URL" htmlFor="team-logo" error={errors.logoUrl} hint="Optional, https:// only.">
                <Input
                  id="team-logo"
                  value={values.logoUrl}
                  maxLength={2000}
                  onChange={(e) => set({ logoUrl: e.target.value })}
                />
              </FormField>
              <FormField
                label="Brand color"
                htmlFor="team-color"
                error={errors.brandColor}
                hint="Optional, e.g. #2563eb."
              >
                <Input
                  id="team-color"
                  value={values.brandColor}
                  maxLength={7}
                  onChange={(e) => set({ brandColor: e.target.value })}
                />
              </FormField>
            </>
          )}
        </div>
      )}
    </PayloadForm>
  );
}
