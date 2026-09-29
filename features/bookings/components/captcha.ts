"use client";

import { solveChallenge } from "altcha-lib/v1";

/**
 * Solves the instance's ALTCHA challenge in the browser (ADM-007) and returns the payload the
 * server verifies. Invisible to the booker: it's a short proof-of-work, no puzzle.
 */
export async function solveCaptcha(): Promise<string | undefined> {
  const res = await fetch("/api/public/captcha", { cache: "no-store" });
  if (!res.ok) return undefined;
  const c = (await res.json()) as { algorithm: string; challenge: string; maxnumber: number; salt: string; signature: string };
  const solution = await solveChallenge(c.challenge, c.salt, c.algorithm, c.maxnumber).promise;
  if (!solution) return undefined;
  return btoa(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number: solution.number, salt: c.salt, signature: c.signature }));
}
