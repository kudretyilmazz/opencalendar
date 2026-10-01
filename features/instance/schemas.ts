import { z } from "zod";
import { TIME_FORMATS, WEEK_STARTS } from "@/features/settings/schemas";
import { RADII } from "./defaults";
import { contrastRatio, HEX_COLOR, UI_CONTRAST } from "./theme/contrast";
import { BACKGROUNDS, type Scheme } from "./theme/css";

/** Checkbox: "on" when ticked, absent otherwise. */
const checkbox = z
  .union([z.literal("on"), z.boolean()])
  .optional()
  .transform((v) => v === "on" || v === true);

/** Optional text: blank means "use the default" (stored as null). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .optional()
    .transform((v) => (v ? v : null));

const optionalColor = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || HEX_COLOR.test(v), "Use a #rrggbb color");

const optionalChoice = <T extends number>(values: readonly T[]) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v !== "default" ? Number(v) : null))
    .refine((v): v is T | null => v === null || values.includes(v as T), "Unsupported value");

const SUPPORTED_TIME_ZONES = new Set([...Intl.supportedValuesOf("timeZone"), "UTC"]);

export const brandingSchema = z.object({
  appName: z
    .string()
    .trim()
    .min(1, "App name is required")
    .max(60, "At most 60 characters")
    .refine((v) => !/[\r\n]/.test(v), "Use a single line"),
  description: optionalText(200),
  hidePoweredBy: checkbox,
  hideSourceLink: checkbox,
});
export type BrandingInput = z.infer<typeof brandingSchema>;

const COLOR_FIELDS = [
  ["lightPrimary", "light"],
  ["lightHighlight", "light"],
  ["darkPrimary", "dark"],
  ["darkHighlight", "dark"],
] as const satisfies readonly (readonly [string, Scheme])[];

export const themeSchema = z
  .object({
    lightPrimary: optionalColor,
    lightHighlight: optionalColor,
    darkPrimary: optionalColor,
    darkHighlight: optionalColor,
    radius: z
      .string()
      .optional()
      .transform((v) => (v && v !== "default" ? v : null))
      .refine((v): v is (typeof RADII)[number] | null => v === null || (RADII as readonly string[]).includes(v), "Unsupported radius"),
    defaultTheme: z.enum(["system", "light", "dark"]),
  })
  .superRefine((value, ctx) => {
    // Buttons and focus rings must stand out from the page (WCAG 1.4.11, NFR-008). Their text
    // color is derived, so it always reads (see readableForeground).
    for (const [field, scheme] of COLOR_FIELDS) {
      const color = value[field];
      if (color && HEX_COLOR.test(color) && contrastRatio(color, BACKGROUNDS[scheme]) < UI_CONTRAST) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `Too close to the ${scheme} background (needs ${UI_CONTRAST}:1 contrast)`,
        });
      }
    }
  })
  .transform((v) => ({
    theme: {
      ...((v.lightPrimary || v.lightHighlight) && {
        light: { ...(v.lightPrimary && { primary: v.lightPrimary }), ...(v.lightHighlight && { highlight: v.lightHighlight }) },
      }),
      ...((v.darkPrimary || v.darkHighlight) && {
        dark: { ...(v.darkPrimary && { primary: v.darkPrimary }), ...(v.darkHighlight && { highlight: v.darkHighlight }) },
      }),
    },
    radius: v.radius,
    defaultTheme: v.defaultTheme,
  }));
export type ThemeInput = z.infer<typeof themeSchema>;

export const emailSchema = z.object({
  emailFooterText: optionalText(300),
  emailButtonColor: optionalColor.refine(
    (v) => v === null || !HEX_COLOR.test(v) || contrastRatio(v, "#ffffff") >= UI_CONTRAST,
    `Too light for a button on a white email (needs ${UI_CONTRAST}:1 contrast)`,
  ),
});
export type EmailInput = z.infer<typeof emailSchema>;

export const platformSchema = z.object({
  signupMode: z
    .enum(["env", "open", "invite_only", "disabled"])
    .transform((v) => (v === "env" ? null : v)),
  landingHeadline: optionalText(120),
  landingBody: optionalText(600),
  loginMessage: optionalText(300),
  oauthGoogleHidden: checkbox,
  oauthMicrosoftHidden: checkbox,
  defaultTimeZone: z
    .string()
    .optional()
    .transform((v) => (v && v !== "default" ? v : null))
    .refine((v) => v === null || SUPPORTED_TIME_ZONES.has(v), "Unknown time zone"),
  defaultWeekStart: optionalChoice(WEEK_STARTS),
  defaultTimeFormat: optionalChoice(TIME_FORMATS),
});
export type PlatformInput = z.infer<typeof platformSchema>;
