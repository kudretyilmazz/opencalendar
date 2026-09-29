import { SUBSCRIBABLE_TRIGGERS, TRIGGER_LABELS } from "../payload";

export type TriggerCheckboxesProps = { idPrefix: string; selected: readonly string[]; error?: string };

/** Accessible group of trigger checkboxes; submits every checked value as `triggers`. */
export function TriggerCheckboxes({ idPrefix, selected, error }: TriggerCheckboxesProps) {
  const errorId = `${idPrefix}-triggers-error`;
  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1 text-sm font-medium">Triggers</legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {SUBSCRIBABLE_TRIGGERS.map((trigger) => {
          const id = `${idPrefix}-${trigger}`;
          return (
            <label key={trigger} htmlFor={id} className="flex items-center gap-2 text-sm">
              <input id={id} type="checkbox" name="triggers" value={trigger} defaultChecked={selected.includes(trigger)} className="size-4" />
              {TRIGGER_LABELS[trigger]}
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
