import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { SUBSCRIBABLE_TRIGGERS, TRIGGER_LABELS } from "../payload";

export type TriggerCheckboxesProps = { idPrefix: string; selected: readonly string[]; error?: string };

/** Accessible group of trigger checkboxes; submits every checked value as `triggers`. */
export function TriggerCheckboxes({ idPrefix, selected, error }: TriggerCheckboxesProps) {
  const errorId = `${idPrefix}-triggers-error`;
  return (
    <FieldSet className="gap-1.5" aria-describedby={error ? errorId : undefined}>
      <FieldLegend variant="label">Triggers</FieldLegend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {SUBSCRIBABLE_TRIGGERS.map((trigger) => {
          const id = `${idPrefix}-${trigger}`;
          const checked = selected.includes(trigger);
          // Radix resets a checkbox to its first-mount value when React resets the form after the
          // action; keying on the saved state remounts it so the reset lands on what was saved.
          return (
            <Field key={`${trigger}-${checked}`} orientation="horizontal">
              <Checkbox id={id} name="triggers" value={trigger} defaultChecked={checked} />
              <FieldLabel htmlFor={id} className="font-normal">
                {TRIGGER_LABELS[trigger]}
              </FieldLabel>
            </Field>
          );
        })}
      </div>
      {error && (
        <FieldError id={errorId} className="text-xs">
          {error}
        </FieldError>
      )}
    </FieldSet>
  );
}
