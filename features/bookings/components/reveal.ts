/** How much of a just-revealed section must already be on screen to leave the scroll alone. */
export const MIN_VISIBLE_PX = 120;

/**
 * Whether a section that appeared below the content the visitor just used (e.g. a day's times
 * under the calendar on a phone) is out of sight and should be scrolled into view.
 */
export function shouldReveal(rect: { top: number }, viewportHeight: number, minVisible = MIN_VISIBLE_PX): boolean {
  return rect.top > viewportHeight - minVisible;
}

/** Scrolls without animation for people who asked for reduced motion. */
export function revealBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
