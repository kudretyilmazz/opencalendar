"use client";

import { createContext, type ReactNode, useActionState, useContext, useState } from "react";
import { FormField } from "@/components/form-field";
import { HEADER_BUTTON_CLASS, PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { settingsCardClass } from "@/features/settings/components/settings-section";
import { type ActionState, idle } from "@/lib/actions";
import { cn } from "@/lib/cn";
import { submitWithoutReset } from "@/lib/submit-without-reset";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const ErrorsContext = createContext<Partial<Record<string, string>>>({});
const DirtyContext = createContext<() => void>(() => {});

export const FIELD_CLASS = "h-10 rounded-md";
export const fieldsCardClass = cn(settingsCardClass, "flex flex-col gap-5 p-4 md:px-6 md:py-5");

function useField(name: string) {
  const error = useContext(ErrorsContext)[name];
  const markDirty = useContext(DirtyContext);
  const invalid = error ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` } : {};
  return { error, invalid, markDirty };
}

/**
 * Page header with the save button, the result message and the form for one admin settings page.
 * Field errors reach the fields below through context; the form keeps what was typed when a
 * save fails (submitWithoutReset).
 */
export function AdminForm({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description: string;
  action: Action;
  children: ReactNode;
}) {
  const [dirty, setDirty] = useState(false);
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.status === "success") setDirty(false);
    return result;
  }, idle);

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {dirty && <span className="text-[13px] text-muted-foreground">Unsaved changes</span>}
            <Button type="submit" form={id} disabled={pending} className={HEADER_BUTTON_CLASS}>
              {pending && <Spinner />}
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      />
      {state.message && (
        <Alert variant={state.status === "success" ? "success" : "destructive"}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <form
        id={id}
        action={dispatch}
        onSubmit={submitWithoutReset(dispatch)}
        onChange={() => setDirty(true)}
        className="flex flex-col gap-5 md:gap-7"
      >
        <ErrorsContext.Provider value={state.fieldErrors ?? {}}>
          <DirtyContext.Provider value={() => setDirty(true)}>{children}</DirtyContext.Provider>
        </ErrorsContext.Provider>
      </form>
    </>
  );
}

export function TextField({
  name,
  label,
  defaultValue,
  hint,
  maxLength,
  required,
  placeholder,
  multiline,
}: {
  name: string;
  label: string;
  defaultValue: string;
  hint?: string;
  maxLength: number;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
}) {
  const { error, invalid } = useField(name);
  const common = { id: name, name, defaultValue, maxLength, required, placeholder, ...invalid };
  return (
    <FormField label={label} htmlFor={name} error={error} hint={hint}>
      {multiline ? <Textarea rows={3} {...common} /> : <Input className={FIELD_CLASS} {...common} />}
    </FormField>
  );
}

/** A labelled switch row; submits "on" when checked, like a checkbox. */
export function SwitchField({
  name,
  label,
  hint,
  defaultChecked,
  onCheckedChange,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  const { markDirty } = useField(name);
  return (
    <div className="flex items-center gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={name} className="text-sm font-medium">
          {label}
        </label>
        <span id={`${name}-hint`} className="text-[13px] text-muted-foreground">
          {hint}
        </span>
      </div>
      <Switch
        id={name}
        name={name}
        defaultChecked={defaultChecked}
        onCheckedChange={(checked) => {
          onCheckedChange?.(checked);
          markDirty();
        }}
        aria-describedby={`${name}-hint`}
      />
    </div>
  );
}

/** Labelled shadcn Select submitting `name`. Keyed on the saved value so it follows a save. */
export function SelectField({
  name,
  label,
  defaultValue,
  options,
  hint,
}: {
  name: string;
  label: string;
  defaultValue: string;
  /** Pairs keep their order; a record's integer-like keys would sort first. */
  options: Record<string, string> | readonly (readonly [string, string])[];
  hint?: string;
}) {
  const { error, invalid, markDirty } = useField(name);
  const entries = Array.isArray(options) ? options : Object.entries(options);
  return (
    <FormField label={label} htmlFor={name} error={error} hint={hint}>
      <Select key={defaultValue} name={name} defaultValue={defaultValue} onValueChange={markDirty}>
        <SelectTrigger id={name} className={cn("w-full data-[size=default]:h-10", FIELD_CLASS)} {...invalid}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {entries.map(([value, optionLabel]) => (
            <SelectItem key={value} value={value}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

/**
 * A brand color: native color picker plus a hex text field (blank = built-in default). The two
 * stay in sync; only the text field is submitted, so "blank" can be expressed.
 */
export function ColorField({
  name,
  label,
  defaultValue,
  placeholder,
  hint,
  onValueChange,
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholder: string;
  hint?: string;
  onValueChange?: (value: string) => void;
}) {
  const { error, invalid, markDirty } = useField(name);
  const [value, setValue] = useState(defaultValue);
  const update = (next: string) => {
    setValue(next);
    onValueChange?.(next);
    markDirty();
  };
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <FormField label={label} htmlFor={name} error={error} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={valid ? value.toLowerCase() : placeholder}
          onChange={(e) => update(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
        />
        <Input
          id={name}
          name={name}
          value={value}
          onChange={(e) => update(e.target.value.trim())}
          placeholder={`${placeholder} (default)`}
          maxLength={7}
          spellCheck={false}
          className={cn(FIELD_CLASS, "font-mono")}
          {...invalid}
        />
        {value && (
          <Button type="button" variant="ghost" className="h-10 shrink-0" onClick={() => update("")}>
            Reset
          </Button>
        )}
      </div>
    </FormField>
  );
}
