"use client";

import { type ReactNode, useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  cleanEmail,
  DEFAULT_EMBED_OPTIONS,
  type EmbedMode,
  type EmbedTheme,
  type FloatingPosition,
  MAX_HEIGHT,
  MAX_PREFILL_LENGTH,
  MAX_TEXT_LENGTH,
  MIN_HEIGHT,
  normalizeHex,
  normalizeWidth,
} from "../options";
import type { BookingLayout, EmbedTarget } from "../target";

/** What the form holds: raw text as typed; `sanitizeEmbedOptions` turns it into options. */
export type EmbedDraft = {
  theme: EmbedTheme;
  brand: string;
  layout: BookingLayout;
  hideDetails: boolean;
  name: string;
  email: string;
  width: string;
  height: string;
  buttonText: string;
  buttonColor: string;
  buttonPosition: FloatingPosition;
};

export const INITIAL_DRAFT: EmbedDraft = {
  theme: DEFAULT_EMBED_OPTIONS.theme,
  brand: "",
  layout: DEFAULT_EMBED_OPTIONS.layout,
  hideDetails: false,
  name: "",
  email: "",
  width: DEFAULT_EMBED_OPTIONS.width,
  height: String(DEFAULT_EMBED_OPTIONS.height),
  buttonText: DEFAULT_EMBED_OPTIONS.buttonText,
  buttonColor: "",
  buttonPosition: DEFAULT_EMBED_OPTIONS.buttonPosition,
};

const THEMES: readonly { value: EmbedTheme; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const LAYOUTS: readonly { value: BookingLayout; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "column", label: "Column" },
];
const POSITIONS: readonly { value: FloatingPosition; label: string }[] = [
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
];

const CONTROL = "h-10 rounded-md bg-card dark:bg-card";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-3 text-[13px] font-semibold text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

function Row({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const message = error ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-[13px]">
        {label}
      </Label>
      {children}
      {message && (
        <p
          id={htmlFor ? `${htmlFor}-hint` : undefined}
          className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
        >
          {message}
        </p>
      )}
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={0}
        aria-label={label}
        value={value}
        onValueChange={(next) => next && onChange(next as T)}
        className="w-full"
      >
        {options.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className="h-9 flex-1 px-2.5">
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function ColorInput({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const color = normalizeHex(value);
  const invalid = value.trim() !== "" && !color;
  return (
    <Row
      label={label}
      htmlFor={id}
      hint="Hex color, e.g. #0f766e. Empty uses the default."
      error={invalid ? "Use a 6-digit hex color like #0f766e." : undefined}
    >
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 rounded-sm border border-border"
          style={{ background: color ?? "transparent" }}
        />
        <Input
          id={id}
          value={value}
          maxLength={7}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-hint`}
          onChange={(e) => onChange(e.target.value)}
          className={`${CONTROL} pl-9 font-mono`}
        />
      </div>
    </Row>
  );
}

/** Left column of the builder: settings for the current embed type. */
export function EmbedSettings({
  mode,
  target,
  draft,
  onChange,
}: {
  mode: EmbedMode;
  target: EmbedTarget;
  draft: EmbedDraft;
  onChange: (next: EmbedDraft) => void;
}) {
  const id = useId();
  const set = <K extends keyof EmbedDraft>(key: K, value: EmbedDraft[K]) => onChange({ ...draft, [key]: value });
  // Layout, the details column and prefill only apply to a single event type's booking page.
  const singleEvent = target.kind === "eventType" || target.kind === "teamEventType";
  const widthInvalid = !normalizeWidth(draft.width);
  const height = Number(draft.height);
  const heightInvalid = !Number.isInteger(height) || height < MIN_HEIGHT || height > MAX_HEIGHT;
  const emailInvalid = draft.email.trim() !== "" && !cleanEmail(draft.email);

  return (
    <div className="flex flex-col gap-5">
      {mode === "inline" && (
        <Section title="Window size">
          <div className="grid grid-cols-2 gap-3">
            <Row label="Width" htmlFor={`${id}-width`} error={widthInvalid ? "100% or e.g. 600px" : undefined}>
              <Input
                id={`${id}-width`}
                value={draft.width}
                maxLength={6}
                spellCheck={false}
                aria-invalid={widthInvalid || undefined}
                aria-describedby={widthInvalid ? `${id}-width-hint` : undefined}
                onChange={(e) => set("width", e.target.value)}
                className={CONTROL}
              />
            </Row>
            <Row
              label="Height (px)"
              htmlFor={`${id}-height`}
              error={heightInvalid ? `${MIN_HEIGHT}–${MAX_HEIGHT}` : undefined}
            >
              <Input
                id={`${id}-height`}
                type="number"
                inputMode="numeric"
                min={MIN_HEIGHT}
                max={MAX_HEIGHT}
                step={10}
                value={draft.height}
                aria-invalid={heightInvalid || undefined}
                aria-describedby={heightInvalid ? `${id}-height-hint` : undefined}
                onChange={(e) => set("height", e.target.value)}
                className={CONTROL}
              />
            </Row>
          </div>
        </Section>
      )}

      {(mode === "floating" || mode === "popup") && (
        <Section title="Button">
          <Row label="Button text" htmlFor={`${id}-text`}>
            <Input
              id={`${id}-text`}
              value={draft.buttonText}
              maxLength={MAX_TEXT_LENGTH}
              onChange={(e) => set("buttonText", e.target.value)}
              className={CONTROL}
            />
          </Row>
          {mode === "floating" && (
            <>
              <ColorInput
                id={`${id}-button-color`}
                label="Button color"
                value={draft.buttonColor}
                placeholder="#111827"
                onChange={(v) => set("buttonColor", v)}
              />
              <Choice
                label="Position"
                value={draft.buttonPosition}
                options={POSITIONS}
                onChange={(v) => set("buttonPosition", v)}
              />
            </>
          )}
        </Section>
      )}

      <Section title="Appearance">
        <Choice label="Theme" value={draft.theme} options={THEMES} onChange={(v) => set("theme", v)} />
        <ColorInput
          id={`${id}-brand`}
          label="Brand color"
          value={draft.brand}
          placeholder="#0f766e"
          onChange={(v) => set("brand", v)}
        />
        {singleEvent && (
          <>
            <Choice label="Layout" value={draft.layout} options={LAYOUTS} onChange={(v) => set("layout", v)} />
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={`${id}-hide`} className="text-[13px]">
                Hide event details
              </Label>
              <Switch id={`${id}-hide`} checked={draft.hideDetails} onCheckedChange={(v) => set("hideDetails", v)} />
            </div>
          </>
        )}
      </Section>

      {singleEvent && (
        <Section title="Prefill (optional)">
          <Row label="Name" htmlFor={`${id}-name`}>
            <Input
              id={`${id}-name`}
              value={draft.name}
              maxLength={MAX_PREFILL_LENGTH}
              autoComplete="off"
              onChange={(e) => set("name", e.target.value)}
              className={CONTROL}
            />
          </Row>
          <Row label="Email" htmlFor={`${id}-email`} error={emailInvalid ? "Enter an email address." : undefined}>
            <Input
              id={`${id}-email`}
              type="email"
              value={draft.email}
              maxLength={MAX_PREFILL_LENGTH}
              autoComplete="off"
              aria-invalid={emailInvalid || undefined}
              aria-describedby={emailInvalid ? `${id}-email-hint` : undefined}
              onChange={(e) => set("email", e.target.value)}
              className={CONTROL}
            />
          </Row>
        </Section>
      )}
    </div>
  );
}
