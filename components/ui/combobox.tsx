"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";

export type ComboboxOption = { value: string; label: string };

export type ComboboxProps = {
  id?: string;
  /** Submits the value through a hidden input for server-action forms. */
  name?: string;
  options: readonly ComboboxOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/** Searchable select (Popover + Command) for long lists such as time zones. */
export function Combobox({
  id,
  name,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  disabled,
  className,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue ?? "");
  const current = value ?? internal;
  const selected = options.find((o) => o.value === current);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
          {...aria}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDownIcon className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  // cmdk matches on `value`; include the label so both "Istanbul" and "Europe/Istanbul" hit.
                  value={`${option.value} ${option.label}`}
                  onSelect={() => {
                    if (value === undefined) setInternal(option.value);
                    onValueChange?.(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                  <CheckIcon className={cn("ml-auto", option.value === current ? "opacity-100" : "opacity-0")} aria-hidden />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
      {name && <input type="hidden" name={name} value={current} />}
    </Popover>
  );
}

/** Time zone options labelled the way the app always showed them ("America/New York"). */
export const timeZoneOptions = (timeZones: readonly string[]): ComboboxOption[] =>
  timeZones.map((tz) => ({ value: tz, label: tz.replaceAll("_", " ") }));
