import { type FormEvent, startTransition } from "react";

/**
 * `onSubmit` for forms whose state lives in React (editors that stay on screen after saving).
 * Use it together with the action: `<form action={act} onSubmit={submitWithoutReset(act)}>`.
 *
 * React resets a `<form action={…}>` after the action runs, and Radix checkboxes, switches and
 * selects answer a reset by reporting their first-mount value through `onCheckedChange` /
 * `onValueChange` — silently undoing what was just saved. Preventing the default here makes React
 * skip its own action dispatch (and so the reset); we dispatch by hand instead. Keep `action` on
 * the form anyway: it is what makes React capture a submit made before hydration and replay it
 * through this handler, instead of the browser doing a native submit that reloads the page.
 * The clicked submit button's name/value is kept, as a native submit would.
 */
export function submitWithoutReset(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };
}
