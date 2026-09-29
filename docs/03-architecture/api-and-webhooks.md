# API and webhooks

Public REST API `/api/v1`, API key auth, versioning and envelope conventions, outgoing webhooks and embed events.

Last updated: 2026-09-29

> **Status in 1.0:** the webhooks, signatures, delivery log and embed events described below are
> shipped. The public REST API (`/api/v1`, API keys, OpenAPI) is **planned for M5** and does not
> exist in 1.0 — the sections "Resources" to "OpenAPI" are its design. The booking pages use two
> internal, unversioned endpoints (`/api/public/slots`, `/api/public/captcha`) and Server Actions;
> they are not a stable API.

The REST API will be implemented with Next.js Route Handlers (`app/api/v1/**/route.ts`), which are
not cached by default in Next.js 16 (`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`).
Handlers are thin: authenticate, validate (Zod), authorize, call the same `features/*/server/service.ts`
functions the UI's Server Actions use ([system-overview.md](./system-overview.md#module-boundaries-and-dependency-rules)).
The API ships in **M5**.

## Resources (planned, M5)

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/api/v1/me` | `profile:read` | Current user/key owner, time zone, teams |
| GET | `/api/v1/event-types` | `event_types:read` | Own + team event types; `?teamId=` |
| POST | `/api/v1/event-types` | `event_types:write` | |
| GET/PATCH/DELETE | `/api/v1/event-types/{id}` | read / write | Includes locations, questions, limits, hosts |
| GET | `/api/v1/schedules` | `schedules:read` | |
| POST | `/api/v1/schedules` | `schedules:write` | Rules + overrides in one payload |
| GET/PATCH/DELETE | `/api/v1/schedules/{id}` | read / write | |
| GET | `/api/v1/slots` | public or `slots:read` | `eventTypeId` or `username+slug`, `start`, `end`, `timeZone`, `duration?`, `rescheduleUid?`, `explain?` (owner only) |
| GET | `/api/v1/bookings` | `bookings:read` | Filters: `status`, `from`, `to`, `eventTypeId`, `attendeeEmail` |
| POST | `/api/v1/bookings` | public or `bookings:write` | Requires `Idempotency-Key` header |
| GET | `/api/v1/bookings/{uid}` | `bookings:read` | |
| POST | `/api/v1/bookings/{uid}/cancel` | `bookings:write` or signed attendee token | `reason` |
| POST | `/api/v1/bookings/{uid}/reschedule` | `bookings:write` or signed attendee token | `start`, `reason` |
| POST | `/api/v1/bookings/{uid}/confirm` / `reject` | `bookings:write` (host) | For `requires_confirmation` |
| POST | `/api/v1/bookings/{uid}/no-show` | `bookings:write` (host) | Mark attendees or host |
| GET/POST | `/api/v1/webhooks` | `webhooks:read` / `webhooks:write` | |
| GET/PATCH/DELETE | `/api/v1/webhooks/{id}` | read / write | |
| GET | `/api/v1/webhooks/{id}/deliveries` | `webhooks:read` | Delivery log |
| POST | `/api/v1/webhooks/{id}/deliveries/{deliveryId}/redeliver` | `webhooks:write` | |
| POST | `/api/v1/webhooks/{id}/ping` | `webhooks:write` | Sends `ping` event |
| GET | `/api/v1/openapi.json` | public | Generated spec |

Team resources (`/api/v1/teams`, memberships, routing forms) are added later additively.

## Authentication

- Header: `Authorization: Bearer oc_live_<prefix>_<secret>`.
- Keys are generated with 32 bytes of randomness; only `SHA-256(key)` is stored
  (`api_key.key_hash`) along with the display `prefix`. The full key is shown once at creation.
- Lookup by hash, constant-time compare, check `revoked_at`, `expires_at`; update
  `last_used_at` at most once per minute.
- **Scopes**: `profile:read`, `event_types:read|write`, `schedules:read|write`,
  `bookings:read|write`, `webhooks:read|write`, `slots:read`. Keys belong to a user; team keys
  (`team_id` set) act with the permissions of the team role chosen at creation (admin max).
- Every request still passes the same ownership checks as the UI ([security.md](./security.md#authorization)).
- Public endpoints (`GET /slots`, `POST /bookings`) do not need a key but are rate limited more
  strictly and only work for non-hidden event types or with a valid single-use link token.
- OAuth2 for third-party apps is a later addition (not in M5).

## Versioning policy

- Major version in the URL: `/api/v1`. A `/api/v2` is only created for breaking changes, and
  `v1` then stays supported for at least **12 months** with `Deprecation` and `Sunset` headers.
- Within `v1`, changes are **additive only**: new endpoints, new optional request fields, new
  response fields, new enum values in documented open enums (clients must ignore unknown
  fields and tolerate unknown enum values).
- Webhook payloads follow the same rule and carry `"version": 1` (a number, see below).
- Changes are recorded in `CHANGELOG.md` under an "API" heading.

## Envelope, pagination and errors

Every JSON response uses `{ data, error, meta }`:

```json
{ "data": [ { "uid": "bk_3F9...", "status": "accepted" } ],
  "error": null,
  "meta": { "nextCursor": "eyJpZCI6...", "limit": 50, "requestId": "req_01J..." } }
```

```json
{ "data": null,
  "error": { "code": "slot_unavailable", "message": "The selected time is no longer available.",
             "details": [ { "path": "start", "issue": "taken" } ] },
  "meta": { "requestId": "req_01J..." } }
```

- **Pagination**: cursor-based (`?limit=50&cursor=...`, max 100), cursor is an opaque base64 of
  `(sort_key, id)`. No offset pagination.
- **Times**: ISO 8601 UTC with `Z` in responses; requests accept any offset. Time zones are IANA names.
- **Error codes** (stable strings) with HTTP status: `validation_failed` 400, `unauthorized` 401,
  `forbidden` 403, `not_found` 404, `slot_unavailable` 409, `idempotency_conflict` 409,
  `rate_limited` 429, `integration_error` 502, `internal` 500. Internal messages are never leaked.
- `Idempotency-Key` on POST creates: same key + same body returns the original response for 24 h;
  same key + different body returns `idempotency_conflict`.

## Rate limiting

- Token bucket per key (authenticated) and per IP (public), stored in Postgres
  (`rate_limit_bucket` unlogged table) so it works across replicas without Redis; an in-memory
  limiter is used when only one web instance runs.
- Defaults: 120 req/min per API key; public `GET /slots` 60 req/min per IP; public
  `POST /bookings` 10 req/min per IP and 5 per attendee email per hour. Configurable via env.
- Responses include `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`; 429 adds `Retry-After`.

## OpenAPI

- Request/response schemas are Zod schemas in `features/*/schemas.ts`. A registry built with
  `@asteasolutions/zod-to-openapi` (or Zod 4's native JSON Schema output) produces
  `openapi.json` at build time; it is also served at `/api/v1/openapi.json` and rendered at `/docs/api`.
- CI fails if the generated spec changes in a non-additive way without a version bump
  (spec diff with `oasdiff`).

## Webhooks

Code: `features/webhooks` (payload schema, signing, service, emitter, `webhook.deliver` worker);
settings UI at `/settings/webhooks`.

### Triggers

| Trigger | Fired when | Milestone |
|---|---|---|
| `BOOKING_CREATED` | Booking accepted (no confirmation needed, or host accepted it) | M3 |
| `BOOKING_REQUESTED` | Booking created that needs host confirmation | M3 |
| `BOOKING_REJECTED` | Host rejects a requested booking | M3 |
| `BOOKING_RESCHEDULED` | Booking moved (the new booking; payload includes `rescheduledFromUid`) | M3 |
| `BOOKING_CANCELLED` | Cancelled by attendee, host or system | M3 |
| `BOOKING_NO_SHOW_UPDATED` | Attendee or host no-show flag changed | M3 |
| `MEETING_ENDED` | Delayed job at the booking's end time (skipped if cancelled/moved) | M3 |
| `BOOKING_PAID` | Payment succeeded (reserved) | M5 |
| `FORM_SUBMITTED` | Routing form response stored (`submitResponse`, after the response row exists) | M4 |
| `PING` | "Send test ping" in the UI (only to that subscription) | M3 |

### Scopes

A subscription has exactly one scope (`webhook.team_id` and `webhook.event_type_id` are never both set):

| Scope | Managed by | Fires for |
|---|---|---|
| User, all event types (`eventTypeId = null`) | The owner, `/settings/webhooks` | Bookings of the owner's personal (non-team) event types, and responses to the owner's personal routing forms |
| User, one event type (`eventTypeId` set) | The owner | Bookings of that personal event type only (no form events) |
| Team (`teamId` set) | Team admins and owners, team page `/teams/{id}` | Bookings of the team's event types and of managed copies whose parent template belongs to the team, and responses to the team's routing forms |

A booking of a team event type never reaches the host's personal webhooks, only the team's. A
managed copy is the member's own event type, so their personal webhooks fire for it too, next to
the team's. Team webhooks are authorized with a live role check on every call: a creator who is
demoted or removed loses access immediately, and the personal settings page never lists or edits
team webhooks. Each subscription lists the triggers it wants; paused subscriptions
(`active = false`) receive nothing except manual pings ("Send test ping", available in both scopes).

### Payload (version 1)

Every delivery is a JSON `POST` with this envelope. The Zod schema in
`features/webhooks/payload.ts` (`webhookEnvelopeSchema`) is the source of truth.

```json
{
  "version": 1,
  "id": "3f0c2a4e-8a51-4c52-9d0e-1f6f3b2d9c11",
  "trigger": "BOOKING_CREATED",
  "createdAt": "2026-10-05T12:00:03.000Z",
  "payload": {
    "booking": {
      "uid": "hTq3...",
      "title": "Intro call between Deniz and Ada",
      "status": "accepted",
      "start": "2026-10-07T13:00:00.000Z",
      "end": "2026-10-07T13:30:00.000Z",
      "timeZone": "Europe/Istanbul",
      "location": { "kind": "google_meet", "value": "https://meet.google.com/..." },
      "responses": { "company": "Acme" },
      "utm": { "utm_source": "newsletter" },
      "noShow": { "host": false },
      "eventType": { "id": "…", "slug": "intro-call", "title": "Intro call" },
      "organizer": { "name": "Deniz", "email": "deniz@example.com", "timeZone": "Europe/Istanbul", "username": "deniz" },
      "attendees": [
        { "name": "Ada", "email": "ada@example.com", "timeZone": "Europe/London", "locale": "en", "noShow": false, "isGuest": false }
      ]
    }
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `version` | `1` | Payload version; breaking changes get a new version (per subscription `payloadVersion`). |
| `id` | string | Delivery id, also sent as `X-OpenCalendar-Delivery`. Stable across retries: de-duplicate on it. |
| `trigger` | string | One of the triggers above. |
| `createdAt` | ISO 8601 | When the event was emitted. |
| `payload.booking.status` | `accepted` \| `pending` \| `awaiting_payment` \| `cancelled` \| `rejected` | |
| `payload.booking.location` | `{ kind, value }` \| `null` | `kind` is the location type (`link`, `in_person`, `phone`, `google_meet`, `zoom`, …); `value` may be `null`. |
| `payload.booking.responses` | object | Booking question answers by question key (string, string[], boolean or number). |
| `payload.booking.utm` | object \| `null` | `utm_*` parameters from the booking page. |
| `payload.booking.rescheduledFromUid` | string, optional | Present on the new booking of a reschedule. |
| `payload.booking.cancellation` | `{ by, reason }`, optional | Present when `status` is `cancelled`; `by` is `attendee`, `host`, `system` or `null`. |
| `payload.booking.rejectionReason` | string, optional | Present when `status` is `rejected` and a reason was given. |

`FORM_SUBMITTED` deliveries use the same envelope (`version`, `id`, `trigger`, `createdAt`) with
this payload; `matchedRuleId` is `null` when the fallback applied and `action` is the resolved
routing action (`event_type`, `external_url` or `message`):

```json
"payload": {
  "form": { "id": "…", "name": "Contact" },
  "response": {
    "id": "…",
    "answers": { "team": "sales", "tags": ["a"] },
    "matchedRuleId": "r-sales",
    "action": { "kind": "event_type", "eventTypeId": "…" },
    "submittedAt": "2026-10-05T12:00:01.000Z"
  }
}
```

`PING` deliveries carry `"payload": { "ping": true, "webhookId": "…" }`. Manage-link tokens and
their hashes are never included. New optional fields may be added within version 1; receivers
should ignore unknown fields. Delivery order is not guaranteed; payloads carry full state, not
deltas.

### Signature

Headers on every delivery:

```text
Content-Type: application/json
User-Agent: OpenCalendar-Webhooks/1
X-OpenCalendar-Event: BOOKING_CREATED
X-OpenCalendar-Delivery: 3f0c2a4e-8a51-4c52-9d0e-1f6f3b2d9c11
X-OpenCalendar-Signature: t=1791201603,v1=5f2b...e9
```

- `v1 = hex(HMAC-SHA256(secret, "<t>.<rawBody>"))`, `t` in Unix seconds. The secret
  (`whsec_` + 32 random bytes, base64url) is generated per subscription, shown once after
  creation or "Roll secret", and stored AES-256-GCM encrypted with the webhook id as AAD.
- Receivers must recompute over the **raw body**, compare in constant time and reject if
  `|now - t| > 300 s` (replay protection). Rolling the secret takes effect immediately.

Verification in Node.js:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyOpenCalendarSignature(rawBody, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=")));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const given = Buffer.from(parts.v1 ?? "", "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Express: app.post("/hooks/opencalendar", express.raw({ type: "application/json" }), (req, res) => {
//   if (!verifyOpenCalendarSignature(req.body.toString("utf8"), req.get("X-OpenCalendar-Signature") ?? "", process.env.OPENCALENDAR_WEBHOOK_SECRET)) return res.sendStatus(401);
//   const event = JSON.parse(req.body); ... res.sendStatus(204);
// });
```

### Delivery and retries

- The emitter (`emitWebhooks`) inserts one `webhook_delivery` row per matching subscription
  with the built payload and enqueues a `webhook.deliver` job (`{ deliveryId }`) for each
  ([ADR-0005](../adr/0005-jobs-pg-boss-no-redis.md)).
- Timeout 10 s; success = any 2xx. Redirects are not followed (a 3xx fails the delivery).
  Only the status is used; response bodies over 64 KiB count as a failure.
- Non-2xx and network errors retry with exponential backoff: `retryLimit: 10`,
  `retryDelay: 60`, `retryBackoff: true`, `retryDelayMax: 6 h`, i.e. 11 attempts over about
  24 h. The last attempt marks the delivery `failed`; blocked (private) targets and redirects
  fail at once without retries.
- `webhook_delivery` keeps status (`pending`/`success`/`failed`), attempts, last response code,
  latency and a short error. The settings page shows the last 20 per subscription with a
  "Retry" button for failed ones (re-enqueues the same delivery id).

### SSRF protection

- On save, the URL must be `https` and its host must not resolve to loopback, link-local
  (169.254.0.0/16 incl. cloud metadata), private (RFC 1918, fc00::/7), CGNAT, multicast or
  documentation ranges, for a friendly form error.
- On **every** delivery the SSRF-safe fetch (`lib/integrations/safe-fetch.ts`) resolves again
  and pins the checked address in the socket lookup, so DNS rebinding is refused.
- `WEBHOOK_ALLOW_PRIVATE=true` (admin, instance-wide) allows private targets and plain `http`,
  e.g. for a LAN n8n.
See [security.md](./security.md#webhook-ssrf).

## Embed events (postMessage)

The embed script (`/embed.js`) creates an iframe to `/embed/{user}/{slug}`. The iframe posts
messages to the parent with `window.parent.postMessage(msg, parentOrigin)`, where `parentOrigin`
comes from the `embedOrigin` query parameter validated against the event owner's allowed embed
domains (if configured) and never `*` for events that carry attendee data.

```ts
type EmbedMessage =
  | { source: 'opencalendar'; type: 'ready' }
  | { source: 'opencalendar'; type: 'resize'; height: number }
  | { source: 'opencalendar'; type: 'slot_selected'; start: string; eventTypeSlug: string }
  | { source: 'opencalendar'; type: 'booking_created'; bookingUid: string; start: string; end: string }
  | { source: 'opencalendar'; type: 'booking_rescheduled'; bookingUid: string }
  | { source: 'opencalendar'; type: 'booking_cancelled'; bookingUid: string }
  | { source: 'opencalendar'; type: 'error'; code: string };
```

The parent can send `{ source: 'opencalendar-host', type: 'prefill', name, email, answers }`
and `{ type: 'theme', ... }`; the iframe accepts these only from the validated parent origin.
Attendee PII is not included in outgoing embed messages beyond the booking uid.
