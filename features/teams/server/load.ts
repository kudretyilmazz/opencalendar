import "server-only";
import { notFound } from "next/navigation";
import { TeamError } from "./access";

/** Page helper: a missing team or a non-member (TEAM-003) is a 404 for pages. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof TeamError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) notFound();
    throw error;
  }
}
