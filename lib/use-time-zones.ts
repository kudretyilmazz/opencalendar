"use client";

import { useSyncExternalStore } from "react";

const EMPTY: readonly string[] = [];
let cache: readonly string[] | null = null;

const read = () => (cache ??= typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : EMPTY);
const subscribe = () => () => undefined;

/**
 * The browser's IANA time zones. Server rendering and hydration see an empty list (each browser
 * engine has a slightly different list than Node, which would break hydration), then the
 * client's own list is used.
 */
export function useTimeZones(): readonly string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
