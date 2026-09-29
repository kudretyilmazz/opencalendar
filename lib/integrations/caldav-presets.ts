/** Guided CalDAV setups (INT-004). Kept dependency-free so client components can import it. */
export const CALDAV_PRESETS = {
  icloud: { name: "iCloud", serverUrl: "https://caldav.icloud.com", help: "Use an app-specific password from appleid.apple.com." },
  fastmail: { name: "Fastmail", serverUrl: "https://caldav.fastmail.com/dav/calendars", help: "Create an app password with CalDAV access." },
  nextcloud: { name: "Nextcloud", serverUrl: "https://your-nextcloud.example.com/remote.php/dav", help: "Use an app password (Settings → Security)." },
  other: { name: "Other CalDAV server", serverUrl: "", help: "Enter your server's CalDAV URL." },
} as const;
