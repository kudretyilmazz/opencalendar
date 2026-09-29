"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { Question } from "@/features/event-types/schemas";
import { emitEmbed, isEmbedded } from "@/lib/embed/bridge";
import { type FormatPrefs, formatDateLong, formatTime } from "@/lib/format";
import type { Answer, Answers } from "../responses";
import { createBookingAction } from "../server/public-actions";
import { solveCaptcha } from "./captcha";
import { QuestionField } from "./question-field";

export type BookingFormConfig = {
  /** Personal host, or "a+b" for a dynamic group (TEAM-009); empty for a team. */
  username: string;
  /** Team slug for team event types (TEAM-001). */
  team?: string;
  slug: string;
  /** Routing-form response id to store on the booking (RTE-004). */
  routing?: string;
  locations: { kind: string; label: string }[];
  maxGuests: number;
  questions: Question[];
  recurring: { frequency: "weekly" | "monthly"; maxCount: number } | null;
  requiresConfirmation: boolean;
  reschedule?: { uid: string; token: string; name: string; email: string; previousStart: number };
  prefill: { name?: string; email?: string; notes?: string; answers: Answers };
  utm: Record<string, string> | null;
  link?: string;
  embed: boolean;
  /** The instance requires an ALTCHA proof-of-work (ADM-007). */
  captcha: boolean;
};

type Props = {
  config: BookingFormConfig;
  slot: { start: number; end: number };
  duration: number;
  prefs: FormatPrefs;
  /** Read at submit time (they live in the widget's refs). */
  tokens: () => { hold: string; idempotencyKey: string };
  onBack: () => void;
  onTaken: () => void;
};

const FREQUENCY_WORD = { weekly: "week", monthly: "month" } as const;

/** The booker's details form: identity, guests, location, questions, series length (BKG-004). */
export function BookingForm({ config, slot, duration, prefs, tokens, onBack, onTaken }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; fields?: Record<string, string> } | null>(null);
  const [locationIndex, setLocationIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(config.prefill.answers);
  // A single booking unless the booker explicitly asks for a series.
  const [count, setCount] = useState(1);
  const chosenKind = config.locations[locationIndex]?.kind;
  const visible = config.questions.filter((q) => !q.hidden);
  const setAnswer = (key: string, value: Answer | undefined) =>
    setAnswers((a) => {
      const { [key]: _removed, ...rest } = a;
      return value === undefined ? rest : { ...rest, [key]: value };
    });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const guests = String(data.get("guests") ?? "")
      .split(/[,\s]+/)
      .filter(Boolean);
    setSubmitting(true);
    setError(null);
    const captcha = config.captcha ? await solveCaptcha().catch(() => undefined) : undefined;
    const result = await createBookingAction({
      username: config.username,
      ...(config.team && { team: config.team }),
      ...(config.routing && { routing: config.routing }),
      slug: config.slug,
      start: slot.start,
      duration,
      booker: { name: String(data.get("name") ?? ""), email: String(data.get("email") ?? ""), timeZone: prefs.timeZone, locale: prefs.locale },
      guests,
      notes: String(data.get("notes") ?? "") || undefined,
      idempotencyKey: tokens().idempotencyKey,
      holdToken: tokens().hold,
      locationIndex: config.locations.length ? locationIndex : undefined,
      phone: chosenKind === "phone_attendee" ? String(data.get("phone") ?? "") : undefined,
      reschedule: config.reschedule && { uid: config.reschedule.uid, token: config.reschedule.token },
      responses: answers,
      utm: config.utm,
      embed: config.embed || undefined,
      link: config.link,
      recurringCount: config.recurring && count > 1 ? count : undefined,
      captcha,
    });
    if (result.ok) {
      emitEmbed("bookingSuccessful", {
        uid: result.data.uid,
        status: result.data.status,
        start: slot.start,
        end: slot.end,
        ...(result.data.external && { redirect: result.data.redirect }),
      });
      if (result.data.external) {
        // External thank-you page (EVT-016): leave the embed frame if we are in one.
        if (isEmbedded()) {
          try {
            window.top!.location.href = result.data.redirect;
            return;
          } catch {
            // Cross-origin top navigation can be blocked; fall back to this frame.
          }
        }
        window.location.assign(result.data.redirect);
        return;
      }
      router.push(result.data.redirect);
      return;
    }
    setSubmitting(false);
    setError({ message: result.message, fields: result.fieldErrors });
    emitEmbed("bookingFailed", { message: result.message });
    if (/taken/.test(result.message)) onTaken();
  };

  const verb = config.reschedule ? "Confirm new time" : config.requiresConfirmation ? "Request booking" : "Confirm booking";

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-4">
      <div>
        <Button type="button" variant="ghost" className="-ml-2.5" onClick={onBack}>
          <ChevronLeft className="size-4" aria-hidden /> Back
        </Button>
        <p className="font-medium">
          {formatDateLong(slot.start, prefs)}, {formatTime(slot.start, prefs)} – {formatTime(slot.end, prefs)}
        </p>
        <p className="text-sm text-muted-foreground">{prefs.timeZone.replaceAll("_", " ")}</p>
      </div>
      <FormField label="Your name" htmlFor="name" error={error?.fields?.["booker.name"]}>
        <Input id="name" name="name" autoComplete="name" required maxLength={100} defaultValue={config.reschedule?.name ?? config.prefill.name} />
      </FormField>
      <FormField label="Email" htmlFor="email" error={error?.fields?.["booker.email"]}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={config.reschedule?.email ?? config.prefill.email} />
      </FormField>
      {config.maxGuests > 0 && !config.reschedule && (
        <FormField label="Guests (optional)" htmlFor="guests" hint={`Up to ${config.maxGuests} emails, separated by commas.`} error={error?.fields?.guests}>
          <Input id="guests" name="guests" />
        </FormField>
      )}
      {config.locations.length > 1 && (
        <FieldSet className="gap-1.5">
          <FieldLegend variant="label" className="mb-1">
            Location
          </FieldLegend>
          <RadioGroup name="location" value={String(locationIndex)} onValueChange={(v) => setLocationIndex(Number(v))}>
            {config.locations.map((loc, i) => (
              <Field key={loc.kind} orientation="horizontal">
                <RadioGroupItem id={`location-${i}`} value={String(i)} />
                <FieldLabel htmlFor={`location-${i}`} className="font-normal">
                  {loc.label}
                </FieldLabel>
              </Field>
            ))}
          </RadioGroup>
        </FieldSet>
      )}
      {chosenKind === "phone_attendee" && (
        <FormField label="Your phone number" htmlFor="phone" hint="International format, e.g. +1 415 555 0100" error={error?.fields?.phone}>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" required />
        </FormField>
      )}
      {visible.map((q) => (
        <QuestionField key={q.key} question={q} value={answers[q.key]} error={error?.fields?.[`answers.${q.key}`]} onChange={(v) => setAnswer(q.key, v)} />
      ))}
      {config.recurring && !config.reschedule && (
        <FormField label="Number of occurrences" htmlFor="occurrences" hint={`Repeats every ${FREQUENCY_WORD[config.recurring.frequency]} at the same time.`}>
          <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
            <SelectTrigger id="occurrences" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: config.recurring.maxCount }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n === 1 ? "Just this once" : `${n} times`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}
      <FormField label="Notes (optional)" htmlFor="notes">
        <Textarea id="notes" name="notes" maxLength={2000} defaultValue={config.prefill.notes} className="min-h-20" />
      </FormField>
      {config.requiresConfirmation && !config.reschedule && <p className="text-sm text-muted-foreground">The host will confirm this booking before it’s final.</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" disabled={submitting}>
        {submitting && <Spinner />}
        {submitting ? "Sending…" : verb}
      </Button>
    </form>
  );
}
