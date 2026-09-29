import { Body, Button, Container, Head, Heading, Hr, Html, Preview, render, Text } from "@react-email/components";
import type { ReactElement } from "react";
import type { CalendarPart } from "@/lib/email/transport";
import { formatDateTimeRange, timeZoneLabel } from "@/lib/format";
import type { EmailContent } from "@/lib/jobs/queues";

/**
 * Transactional email templates. Rendered by the worker from a template name + props, so job
 * payloads stay small and never contain rendered HTML.
 */

export type EmailTemplateInput = EmailContent;

export type RenderedEmail = { subject: string; html: string; text: string; calendar?: CalendarPart };

const styles = {
  body: { backgroundColor: "#f6f7f9", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" },
  container: { backgroundColor: "#ffffff", borderRadius: 8, margin: "32px auto", maxWidth: 480, padding: 32 },
  heading: { fontSize: 20, margin: "0 0 16px" },
  text: { color: "#334155", fontSize: 14, lineHeight: "22px" },
  button: { backgroundColor: "#111827", borderRadius: 6, color: "#ffffff", fontSize: 14, padding: "10px 18px" },
  muted: { color: "#64748b", fontSize: 12, lineHeight: "18px" },
};

function Layout(props: { preview: string; heading: string; footer?: string; children: React.ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.heading}>{props.heading}</Heading>
          {props.children}
          <Hr />
          <Text style={styles.muted}>{props.footer ?? "Sent by OpenCalendar. If you didn’t request this, you can ignore it."}</Text>
        </Container>
      </Body>
    </Html>
  );
}

function ActionEmail(props: { preview: string; heading: string; intro: string; cta: string; url: string; note: string }) {
  return (
    <Layout preview={props.preview} heading={props.heading}>
      <Text style={styles.text}>{props.intro}</Text>
      <Button href={props.url} style={styles.button}>
        {props.cta}
      </Button>
      <Text style={styles.muted}>{props.note}</Text>
      <Text style={styles.muted}>Or paste this link into your browser: {props.url}</Text>
    </Layout>
  );
}

type BookingProps = Extract<EmailContent, { template: "booking-scheduled" | "booking-cancelled" | "booking-requested" | "booking-rejected" }>["props"];

function Occurrences({ props }: { props: { occurrences?: { start: number; end: number }[]; timeZone: string; locale: string; hour12: boolean } }) {
  if (!props.occurrences?.length) return <></>;
  return (
    <Text style={styles.text}>
      <strong>All {props.occurrences.length} dates:</strong>
      {props.occurrences.map((o) => (
        <span key={o.start}>
          <br />• {formatDateTimeRange(o.start, o.end, props)}
        </span>
      ))}
    </Text>
  );
}

function Answers({ answers }: { answers?: { label: string; value: string }[] }) {
  if (!answers?.length) return <></>;
  return (
    <Text style={styles.text}>
      {answers.map((a, i) => (
        <span key={a.label}>
          {i > 0 ? <br /> : null}
          <strong>{a.label}:</strong> {a.value}
        </span>
      ))}
    </Text>
  );
}

function BookingDetails({ props }: { props: BookingProps }) {
  const when = formatDateTimeRange(props.start, props.end, props);
  const other = props.audience === "attendee" ? props.hostName : `${props.attendeeName} (${props.attendeeEmail})`;
  return (
    <>
      <Text style={styles.text}>
        <strong>What:</strong> {props.title}
        <br />
        <strong>When:</strong> {when}
        <br />
        <strong>Time zone:</strong> {timeZoneLabel(props.timeZone, props.start, props.locale)}
        <br />
        <strong>{props.audience === "attendee" ? "Host" : "Invitee"}:</strong> {other}
        {props.location ? (
          <>
            <br />
            <strong>Where:</strong> {props.location}
          </>
        ) : null}
      </Text>
    </>
  );
}

const BOOKING_FOOTER = "Sent by OpenCalendar on behalf of your host.";

function build(input: EmailTemplateInput): { subject: string; element: ReactElement; calendar?: CalendarPart } {
  switch (input.template) {
    case "verify-email":
      return {
        subject: "Verify your email address",
        element: (
          <ActionEmail
            preview="Confirm your email to finish setting up OpenCalendar"
            heading={`Welcome, ${input.props.name}`}
            intro="Confirm your email address to finish setting up your account."
            cta="Verify email"
            url={input.props.url}
            note="This link expires in 24 hours."
          />
        ),
      };
    case "reset-password":
      return {
        subject: "Reset your password",
        element: (
          <ActionEmail
            preview="Reset your OpenCalendar password"
            heading={`Hi ${input.props.name}`}
            intro="We received a request to reset your password."
            cta="Reset password"
            url={input.props.url}
            note="This link can be used once and expires in 60 minutes."
          />
        ),
      };
    case "booking-scheduled": {
      const p = input.props;
      const verb = p.rescheduled ? "Rescheduled" : p.reassigned ? "Updated" : "Confirmed";
      const subject = `${verb}: ${p.title} — ${formatDateTimeRange(p.start, p.end, p)}`;
      const heading = p.rescheduled ? "Your meeting was rescheduled" : p.reassigned ? `Your meeting is now with ${p.hostName}` : p.accepted ? "Your booking was confirmed" : p.occurrences?.length ? "Your recurring meeting is booked" : "Your meeting is booked";
      return {
        subject,
        calendar: p.ics,
        element: (
          <Layout preview={subject} heading={heading} footer={BOOKING_FOOTER}>
            <BookingDetails props={p} />
            <Occurrences props={p} />
            <Answers answers={p.answers} />
            {p.notes ? <Text style={styles.text}>Notes: {p.notes}</Text> : <></>}
            <Button href={p.manageUrl} style={styles.button}>
              {p.audience === "attendee" ? "Reschedule or cancel" : "View in OpenCalendar"}
            </Button>
            <Text style={styles.muted}>The calendar invitation is attached.</Text>
          </Layout>
        ),
      };
    }
    case "booking-cancelled": {
      const p = input.props;
      const subject = `Cancelled: ${p.title} — ${formatDateTimeRange(p.start, p.end, p)}`;
      const by = p.cancelledBy === "host" ? p.hostName : p.cancelledBy === "attendee" ? p.attendeeName : "OpenCalendar";
      return {
        subject,
        calendar: p.ics,
        element: (
          <Layout preview={subject} heading="This meeting was cancelled" footer={BOOKING_FOOTER}>
            <BookingDetails props={p} />
            <Text style={styles.text}>
              Cancelled by {by}.{p.reason ? ` Reason: ${p.reason}` : ""}
            </Text>
            {p.rebookUrl ? (
              <Button href={p.rebookUrl} style={styles.button}>
                Pick a new time
              </Button>
            ) : (
              <></>
            )}
          </Layout>
        ),
      };
    }
    case "booking-requested": {
      const p = input.props;
      const host = p.audience === "host";
      const subject = `${host ? "New booking request" : "Booking requested"}: ${p.title} — ${formatDateTimeRange(p.start, p.end, p)}`;
      return {
        subject,
        element: (
          <Layout preview={subject} heading={host ? "Someone wants to book you" : "Your request was sent"} footer={BOOKING_FOOTER}>
            <BookingDetails props={p} />
            <Occurrences props={p} />
            <Answers answers={p.answers} />
            {p.notes ? <Text style={styles.text}>Notes: {p.notes}</Text> : <></>}
            {host && p.acceptUrl && p.rejectUrl ? (
              <Text style={styles.text}>
                <Button href={p.acceptUrl} style={styles.button}>
                  Accept
                </Button>{" "}
                <Button href={p.rejectUrl} style={{ ...styles.button, backgroundColor: "#b91c1c" }}>
                  Reject
                </Button>
              </Text>
            ) : (
              <Text style={styles.text}>{p.hostName} needs to confirm this booking. You’ll get an email with the calendar invitation once they do.</Text>
            )}
            <Button href={p.manageUrl} style={styles.button}>
              {host ? "Open your bookings" : "View or cancel the request"}
            </Button>
          </Layout>
        ),
      };
    }
    case "booking-rejected": {
      const p = input.props;
      const subject = `Declined: ${p.title} — ${formatDateTimeRange(p.start, p.end, p)}`;
      return {
        subject,
        element: (
          <Layout preview={subject} heading="Your booking request was declined" footer={BOOKING_FOOTER}>
            <BookingDetails props={p} />
            <Text style={styles.text}>
              {p.hostName} can’t make this time.{p.reason ? ` Reason: ${p.reason}` : ""}
            </Text>
            {p.rebookUrl ? (
              <Button href={p.rebookUrl} style={styles.button}>
                Pick another time
              </Button>
            ) : (
              <></>
            )}
          </Layout>
        ),
      };
    }
    case "workflow": {
      const p = input.props;
      return {
        subject: p.subject,
        element: (
          <Layout preview={p.subject} heading={p.subject} footer={BOOKING_FOOTER}>
            {p.body.split(/\n{2,}/).map((para, i) => (
              <Text key={i} style={{ ...styles.text, whiteSpace: "pre-line" }}>
                {para}
              </Text>
            ))}
            <Button href={p.bookingUrl} style={styles.button}>
              View booking
            </Button>
          </Layout>
        ),
      };
    }
    case "integration-error":
      return {
        subject: `Reconnect ${input.props.provider} to keep your calendar in sync`,
        element: (
          <ActionEmail
            preview={`${input.props.provider} stopped working`}
            heading={`Hi ${input.props.name}`}
            intro={`OpenCalendar can no longer access your ${input.props.provider} account (${input.props.account}). Until you reconnect it, new bookings won’t appear in that calendar and its events won’t block your availability.`}
            cta="Reconnect"
            url={input.props.url}
            note="Bookings keep working in the meantime."
          />
        ),
      };
    case "team-invitation":
      return {
        subject: `${input.props.inviterName} invited you to ${input.props.teamName} on OpenCalendar`,
        element: (
          <ActionEmail
            preview={`Join ${input.props.teamName}`}
            heading={`Join ${input.props.teamName}`}
            intro={`${input.props.inviterName} invited you to join ${input.props.teamName} as ${input.props.role === "member" ? "a member" : `an ${input.props.role}`}. Sign in with this email address to accept or decline — new here? Use “Email me a sign-in link” on the sign-in page with this address to create your account.`}
            cta="View invitation"
            url={input.props.url}
            note="The invitation expires in 14 days."
          />
        ),
      };
    case "magic-link":
      return {
        subject: "Your sign in link",
        element: (
          <ActionEmail
            preview="Sign in to OpenCalendar"
            heading="Sign in to OpenCalendar"
            intro="Use the button below to sign in."
            cta="Sign in"
            url={input.props.url}
            note="This link can be used once and expires in 15 minutes."
          />
        ),
      };
  }
}

export async function renderEmail(input: EmailTemplateInput): Promise<RenderedEmail> {
  const { subject, element, calendar } = build(input);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return calendar ? { subject, html, text, calendar } : { subject, html, text };
}
