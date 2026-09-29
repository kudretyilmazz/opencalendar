/**
 * Request time for Server Components. Pages that call this are dynamic (they read the session
 * or search params anyway), so the value is per request, never frozen at build time.
 */
export const requestTime = (): number => Date.now();
