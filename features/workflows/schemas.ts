import { z } from "zod";

export const WORKFLOW_TRIGGERS = ["booking_created", "booking_cancelled", "booking_rescheduled", "before_start", "after_end"] as const;
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];
export const WORKFLOW_RECIPIENTS = ["host", "attendees", "address"] as const;
export type WorkflowRecipient = (typeof WORKFLOW_RECIPIENTS)[number];

export const TRIGGER_LABELS: Record<WorkflowTrigger, string> = {
  booking_created: "When a booking is confirmed",
  booking_cancelled: "When a booking is cancelled",
  booking_rescheduled: "When a booking is rescheduled",
  before_start: "Before the event starts",
  after_end: "After the event ends",
};

export const RECIPIENT_LABELS: Record<WorkflowRecipient, string> = {
  host: "Me (the host)",
  attendees: "Attendees",
  address: "A fixed email address",
};

export const isTimed = (trigger: WorkflowTrigger) => trigger === "before_start" || trigger === "after_end";

/** Template variables (NTF-005). Times are shown in each recipient's own time zone. */
export const TEMPLATE_VARIABLES = [
  "{event_name}",
  "{host_name}",
  "{attendee_name}",
  "{attendee_email}",
  "{date}",
  "{time}",
  "{end_time}",
  "{timezone}",
  "{location}",
  "{booking_url}",
  "{cancel_url}",
  "{reschedule_url}",
  "{answers}",
] as const;

export const workflowFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    trigger: z.enum(WORKFLOW_TRIGGERS),
    offsetMinutes: z.number().int().min(0).max(43_200),
    recipient: z.enum(WORKFLOW_RECIPIENTS),
    address: z.string().trim().toLowerCase().email("Enter a valid email").nullable(),
    subject: z.string().trim().min(1, "Subject is required").max(200),
    body: z.string().trim().min(1, "Message is required").max(5000),
    enabled: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.recipient === "address" && !v.address) ctx.addIssue({ code: "custom", path: ["address"], message: "Enter the email address" });
    if (isTimed(v.trigger) && v.offsetMinutes < 1) ctx.addIssue({ code: "custom", path: ["offsetMinutes"], message: "Enter how long before/after" });
  })
  .transform((v) => ({
    ...v,
    address: v.recipient === "address" ? v.address : null,
    offsetMinutes: isTimed(v.trigger) ? v.offsetMinutes : 0,
  }));

export type WorkflowForm = z.infer<typeof workflowFormSchema>;
export type WorkflowFormInput = z.input<typeof workflowFormSchema>;

export const DEFAULT_REMINDER: WorkflowForm = {
  name: "24-hour reminder",
  trigger: "before_start",
  offsetMinutes: 24 * 60,
  recipient: "attendees",
  address: null,
  subject: "Reminder: {event_name} on {date}",
  body: "Hi {attendee_name},\n\nThis is a reminder of {event_name} with {host_name} on {date} at {time} ({timezone}).\n\nLocation: {location}\nDetails: {booking_url}",
  enabled: true,
};
