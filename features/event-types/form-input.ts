import type { EventTypeFormInput } from "./schemas";
import type { EventTypeView } from "./server/service";

/** Form values for editing an existing event type. */
export function eventTypeToForm(et: EventTypeView): EventTypeFormInput {
  return {
    title: et.title,
    slug: et.slug,
    description: et.description,
    durationMinutes: et.durationMinutes,
    extraDurations: et.extraDurations,
    slotIntervalMinutes: et.slotIntervalMinutes,
    bufferBeforeMinutes: et.bufferBeforeMinutes,
    bufferAfterMinutes: et.bufferAfterMinutes,
    minNoticeMinutes: et.minNoticeMinutes,
    horizonType: et.horizonType,
    horizonDays: et.horizonDays,
    rangeStart: et.rangeStart,
    rangeEnd: et.rangeEnd,
    scheduleId: et.scheduleId,
    locations: et.locations,
    maxGuests: et.maxGuests,
    hidden: et.hidden,
    questions: et.questions,
    requiresConfirmation: et.requiresConfirmation,
    confirmationThresholdMinutes: et.confirmationThresholdMinutes,
    seatsPerSlot: et.seatsPerSlot,
    seatsShowAttendees: et.seatsShowAttendees,
    recurringFrequency: et.recurringFrequency,
    recurringMaxCount: et.recurringMaxCount,
    bookingLimits: et.bookingLimits,
    durationLimits: et.durationLimits,
    linkOnly: et.linkOnly,
    redirectUrl: et.redirectUrl,
    redirectForwardParams: et.redirectForwardParams,
    eventNameTemplate: et.eventNameTemplate,
    disableCancelling: et.disableCancelling,
    disableRescheduling: et.disableRescheduling,
    cancelCutoffMinutes: et.cancelCutoffMinutes,
    lockTimeZone: et.lockTimeZone,
  };
}
