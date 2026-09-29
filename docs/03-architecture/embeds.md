# Embeds

Covers requirements EMB-001 to EMB-005 and NFR-003. Any website can show an OpenCalendar booking page with one
script: `public/embed.js`, served at `https://<your-instance>/embed.js`. The script is
hand-written, dependency-free ES2019 with no build step, and stays under **15 KB gzipped** (it is about 4 KB today).
`lib/embed/embed-size.test.ts` enforces that budget.

```
host page ──<script src=instance/embed.js>──► window.OpenCalendar
    │ creates <iframe src="instance/user/event?embed=1&…">
    ▼
booking page (embed mode) ──postMessage {source:"opencalendar",version:1,type,data}──► host page
```

## Snippets

Replace `https://cal.example.com` with your instance URL and `ada/intro` with `username/event-slug`
(or only `username` for the profile page).

### Inline (EMB-001)

```html
<div data-opencalendar-inline="ada/intro" data-opencalendar-config='{"theme":"light"}'></div>
<script src="https://cal.example.com/embed.js" defer></script>
```

Or with the JS API:

```html
<div id="booking"></div>
<script src="https://cal.example.com/embed.js"></script>
<script>
  OpenCalendar.inline({
    calLink: "ada/intro",
    elementOrSelector: "#booking",
    config: { name: "Eve", email: "eve@example.com", theme: "auto", brand: "#0f766e", layout: "month" },
  });
</script>
```

The iframe resizes its height to fit the booking page automatically (EMB-005). Pass `height` to set the starting
height (default 640 px).

### Popup from any element (EMB-002)

```html
<button type="button" data-opencalendar-link="ada/intro" data-opencalendar-config='{"theme":"dark"}'>
  Book a call
</button>
<script src="https://cal.example.com/embed.js" defer></script>
```

Clicks are delegated from `document`, so elements added later also work. From JS:
`OpenCalendar.popup({ calLink: "ada/intro", config: {...} })` returns `{ iframe, close }`, and
`OpenCalendar.closePopup()` closes whichever popup is open.

The modal is accessible:

- it has `role="dialog"` and `aria-modal="true"`;
- focus moves to its close button when it opens and returns to the trigger when it closes;
- Escape, the close button or a click on the backdrop closes it;
- focus is kept inside the dialog while it is open;
- page scroll is locked while it is open.

Escape works while focus is on the host page. Once focus is inside the booking iframe, keystrokes go to that
document, so use the close button.

### Floating button (EMB-002)

```html
<script src="https://cal.example.com/embed.js"></script>
<script>
  OpenCalendar.floatingButton({
    calLink: "ada/intro",
    text: "Book a meeting",   // default "Book a meeting"
    color: "#0f766e",         // 3- or 6-digit hex; text color is picked for contrast
    position: "bottom-right", // or "bottom-left"
    config: { theme: "auto" },
  });
</script>
```

It returns `{ button, remove }`.

## Config (EMB-004)

`config` (or the `data-opencalendar-config` JSON) is turned into query parameters on the iframe URL. Every URL
also gets `embed=1`.

| Key | Values | Effect |
|---|---|---|
| `theme` | `light`, `dark`, `auto` (default) | Color scheme of the booking page. `auto` follows the visitor's OS setting |
| `brand` | hex color, `#` optional (`"#0f766e"`) | Brand/primary color. Anything that is not a 6-digit hex value is ignored |
| `hideDetails` | `true` | Hides the event details column |
| `layout` | `month` (default), `column` | Booking page layout |
| `name`, `email`, `notes` | string | Prefill the booking form |
| `duration` | minutes | Preselect one of the event's durations |
| `date` | `YYYY-MM-DD` | Preselect a day |
| `<question key>` | string, or an array for multi-select | Prefill a booking question answer |
| `answers` | `{ key: value }` | Same as above, grouped |
| `utm_*` | string | Stored with the booking |
| `title` | string | The iframe's accessible `title` (default "Booking page"); not sent to the page |

Empty, `null` and `false` values are skipped. `calLink` must have one of these shapes, where every segment is
made of letters, digits, `_` and `-`:

| Shape | Example | Page |
|---|---|---|
| `username` or `username/slug` | `ada/intro` | Profile or event booking page |
| `user1+user2[+…]` or `user1+user2/slug` | `ada+bob/intro` | Dynamic group booking page |
| `team/<team>` or `team/<team>/<slug>` | `team/acme/intro` | Team page or team event |
| `forms/<id>` | `forms/f_123` | Routing form (RTE-006) |

Anything else throws, so a link can never point outside the booking pages. Embedded routing forms post
`ready` and `dimensionsChanged` like booking pages, so inline frames resize automatically.

`OpenCalendar.buildUrl(calLink, config)` returns the URL the loader would use. It is handy for a
plain `<iframe>` or a no-JS link.

## Events (EMB-003)

The booking page (`lib/embed/bridge.ts`) posts messages to `window.parent`:

```ts
{ source: "opencalendar", version: 1, type: EmbedEvent, data: {...} } // lib/embed/protocol.ts
```

| `type` | `data` | When |
|---|---|---|
| `ready` | `{}` | Booking page mounted |
| `dateSelected` | `{ date: "YYYY-MM-DD" }` | Visitor picked a day |
| `slotSelected` | `{ start, end }` | Visitor picked a time (epoch milliseconds) |
| `bookingSuccessful` | `{ uid, start, end, status }` | Booking created (`status`: `accepted` or `pending` when confirmation is required) |
| `bookingFailed` | `{ message }` | Booking was rejected (slot taken, validation, rate limit…) |
| `dimensionsChanged` | `{ height }` | Document height changed (px); inline frames resize to it |

Subscribe with the JS API, where `"*"` receives every event:

```js
function onBooked(e) { /* e = { type, data, version, iframe } */ analytics.track("booked", e.data); }
OpenCalendar.on("bookingSuccessful", onBooked);
OpenCalendar.off("bookingSuccessful", onBooked);
```

Or listen for DOM events on `window` without touching the API object, for example from a tag manager:

```js
window.addEventListener("opencalendar:bookingSuccessful", (e) => console.info(e.detail.data));
```

Messages never contain secrets. Manage tokens and attendee data beyond the booking times are not sent.
The page posts with target origin `*` because it cannot know the embedding site.

### Origin check

The loader records the instance origin from its own `<script src>` (`document.currentScript`). It dispatches a
message only when all of these hold:

1. `event.origin === OpenCalendar.origin` (the instance origin);
2. `data.source === "opencalendar"` and `data.version === 1`, and `type` is a known event;
3. `event.source` is one of the iframes this loader created.

If you write your own listener without the loader, apply at least checks 1 and 2.

### Versioning

- `version` is the protocol version, exposed as `OpenCalendar.protocolVersion`.
- Additive changes keep version 1: new event types, or new fields in `data`. Consumers must ignore unknown types
  and fields.
- Renaming or removing an event or field, or changing a field's type, requires `version: 2`. The page would then
  emit v2 messages only to loaders that ask for v2. `/embed.js` stays a v1 loader, and a later loader would be
  served under a new path.
- `/embed.js` is served from the instance, so every instance's loader matches its own booking page.

## Framing policy (EMB-005)

`proxy.ts` sets the `Content-Security-Policy` per request (`lib/security/csp.ts`):

| Request | `frame-ancestors` | `X-Frame-Options` |
|---|---|---|
| `/[username]`, `/[username]/[slug]`, `/booking/[uid]` **with `embed=1`** | `EMBED_ALLOWED_ORIGINS` (default `*`) | not sent |
| same pages without `embed=1` | `'none'` | `DENY` |
| everything else (dashboard, settings, auth, …), with or without `embed=1` | `'none'` | `DENY` (omitted when `embed=1`; CSP still forbids framing) |

`X-Frame-Options` cannot express an allow-list, so `next.config.ts` skips it for `embed=1` requests. For those
requests the CSP `frame-ancestors` directive is authoritative, and every current browser prefers it anyway.

`EMBED_ALLOWED_ORIGINS` is a runtime setting, so changing it needs no rebuild:

- unset or empty: `*`, meaning any http(s) page may embed booking pages;
- a space- (or comma-) separated list of origins:
  `EMBED_ALLOWED_ORIGINS="https://example.com https://*.example.org http://localhost:8080"`. `'self'` and schemes
  such as `https:` are also accepted;
- `none`: embedding is disabled everywhere.

Anything that is not a plain origin (a path, `;`, quotes other than `'self'`/`'none'`) fails startup validation
(`lib/env.ts`). The per-request code fails closed to `'none'`.

The booking page does not use the dashboard session, so browsers that block third-party cookies can still book
through an embed.

## Size budget (NFR-003)

`public/embed.js` must stay below 15 KB gzipped (`lib/embed/embed-size.test.ts`). Keep it dependency-free.
Style elements through CSSOM (`el.style.cssText`), not `<style>` tags or `style` attributes, so the loader keeps
working on host pages with a strict CSP.
