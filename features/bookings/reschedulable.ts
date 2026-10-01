/**
 * Can the host ask the invitee to pick a new time (BKG-010)? Only when the invitee's own
 * reschedule link would work (BKG-009): not for recurring series or seated events, not when the
 * event type turns rescheduling off, and only with the sealed manage token to build the link.
 */
export function canRequestReschedule(
  b: { recurringSeriesId: string | null; manageTokenSealed: string | null },
  et: { disableRescheduling: boolean; seatsPerSlot: number | null },
): boolean {
  return !et.disableRescheduling && et.seatsPerSlot === null && b.recurringSeriesId === null && b.manageTokenSealed !== null;
}
