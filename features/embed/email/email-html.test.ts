import { describe, expect, it } from "vitest";
import {
  bookingPath,
  EmailEmbedError,
  type EmailEmbedInput,
  emailPreviewDocument,
  escapeHtml,
  MAX_EMAIL_SLOTS,
  normalizeAppUrl,
  normalizeDays,
  renderEmailEmbed,
} from "./email-html";

const base: EmailEmbedInput = {
  appUrl: "https://cal.example.com",
  target: { calLink: "ada/intro", label: "Intro call" },
  duration: 30,
  timeZone: "Europe/Istanbul",
  locale: "en",
  hour12: false,
  days: [{ date: "2026-10-06", slots: ["2026-10-06T07:00:00.000Z", "2026-10-06T11:30:00.000Z"] }],
};

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!.replaceAll("&amp;", "&"));

describe("escapeHtml", () => {
  it("escapes markup, quotes and ampersands", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
  });
});

describe("normalizeAppUrl", () => {
  it("drops trailing slashes, query and hash but keeps a base path", () => {
    expect(normalizeAppUrl("https://cal.example.com/")).toBe("https://cal.example.com");
    expect(normalizeAppUrl("https://example.com/cal//?x=1#y")).toBe("https://example.com/cal");
  });
  it("rejects non-http schemes, relative URLs and credentials", () => {
    expect(() => normalizeAppUrl("javascript:alert(1)")).toThrow(EmailEmbedError);
    expect(() => normalizeAppUrl("/relative")).toThrow(EmailEmbedError);
    expect(() => normalizeAppUrl("https://u:p@cal.example.com")).toThrow(EmailEmbedError);
  });
});

describe("bookingPath", () => {
  it("accepts the loader's calLink shapes", () => {
    expect(bookingPath("ada/intro")).toBe("ada/intro");
    expect(bookingPath("/team/robin/discovery/")).toBe("team/robin/discovery");
    expect(bookingPath("erin+olga/intro")).toBe("erin+olga/intro");
  });
  it("rejects anything else", () => {
    for (const bad of ["", "../admin", "ada/intro?x=1", "ada/<b>", "https://evil.test/a", "a/b/c"]) {
      expect(() => bookingPath(bad), bad).toThrow(EmailEmbedError);
    }
  });
});

describe("normalizeDays", () => {
  it("sorts, de-duplicates, drops invalid entries and empty days, and caps the total", () => {
    const days = normalizeDays(
      [
        { date: "2026-10-07", slots: ["2026-10-07T09:00:00Z", "2026-10-07T08:00:00Z", "2026-10-07T08:00:00.000Z", "nope"] },
        { date: "2026-10-06", slots: [] },
        { date: "2026-13-01", slots: ["2026-10-07T10:00:00Z"] },
        { date: "2026-10-05", slots: ["2026-10-05T08:00:00Z"] },
      ],
      2,
    );
    expect(days).toEqual([
      { date: "2026-10-05", slots: [{ iso: "2026-10-05T08:00:00.000Z", ms: Date.parse("2026-10-05T08:00:00Z") }] },
      { date: "2026-10-07", slots: [{ iso: "2026-10-07T08:00:00.000Z", ms: Date.parse("2026-10-07T08:00:00Z") }] },
    ]);
  });
});

describe("renderEmailEmbed", () => {
  it("renders the heading, duration, time zone and a block per day", () => {
    const { html, text } = renderEmailEmbed(base);
    expect(html).toContain("Intro call");
    expect(html).toContain("30 min");
    expect(html).toContain("Europe/Istanbul (GMT+3)");
    expect(html).toContain("Tuesday, October 6");
    expect(text).toContain("Intro call (30 min)");
    expect(text).toContain("Tuesday, October 6");
  });

  it("links every slot to the booking page with date, slot and duration, plus a see-all link", () => {
    const { html, text } = renderEmailEmbed(base);
    expect(hrefs(html)).toEqual([
      "https://cal.example.com/ada/intro?date=2026-10-06&slot=2026-10-06T07%3A00%3A00.000Z&duration=30",
      "https://cal.example.com/ada/intro?date=2026-10-06&slot=2026-10-06T11%3A30%3A00.000Z&duration=30",
      "https://cal.example.com/ada/intro?duration=30",
    ]);
    // Raw "&" never appears inside attributes.
    expect(html).toContain("date=2026-10-06&amp;slot=");
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(text).toContain("- 10:00: https://cal.example.com/ada/intro?date=2026-10-06&slot=2026-10-06T07%3A00%3A00.000Z&duration=30");
    expect(text).toContain("See all available times: https://cal.example.com/ada/intro?duration=30");
  });

  it("never carries tokens or unexpected params", () => {
    const { html } = renderEmailEmbed(base);
    for (const href of hrefs(html)) {
      expect([...new URL(href).searchParams.keys()].every((k) => ["date", "slot", "duration"].includes(k))).toBe(true);
    }
  });

  it("formats times in 12- or 24-hour style", () => {
    expect(renderEmailEmbed(base).html).toMatch(/>14:30</);
    const twelve = renderEmailEmbed({ ...base, hour12: true }).html;
    expect(twelve).toMatch(/>10:00\sAM</);
    expect(twelve).toMatch(/>2:30\sPM</);
  });

  it("localizes dates, durations and copy for Turkish", () => {
    const { html, text } = renderEmailEmbed({ ...base, locale: "tr-TR" });
    expect(html).toContain("6 Ekim Salı");
    expect(html).toContain("30 dk.");
    expect(html).toContain("Tüm uygun saatleri gör");
    expect(text).toContain("Saatler Europe/Istanbul");
  });

  it("falls back to English for an invalid locale", () => {
    expect(renderEmailEmbed({ ...base, locale: "not a locale!!" }).html).toContain("See all available times");
  });

  it("escapes every piece of text: labels, titles and notes", () => {
    const evil = `<script>alert("x")</script> & 'y'`;
    const { html, text } = renderEmailEmbed({ ...base, target: { calLink: "ada/intro", label: evil }, note: `${evil}\nsecond line` });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
    expect(html).toContain("&#39;y&#39;<br>second line");
    expect(text).toContain(evil); // plain text stays verbatim
    const titled = renderEmailEmbed({ ...base, title: '"><img src=x onerror=alert(1)>' }).html;
    expect(titled).not.toContain("<img");
    expect(titled).toContain("&quot;&gt;&lt;img");
  });

  it("uses the title instead of the label when given, ignoring a blank one", () => {
    expect(renderEmailEmbed({ ...base, title: "Pick a slot, Bob" }).html).toContain("Pick a slot, Bob");
    expect(renderEmailEmbed({ ...base, title: "   " }).html).toContain("Intro call");
  });

  it("omits empty days and caps the number of slots", () => {
    const slots = Array.from({ length: 15 }, (_, i) => new Date(Date.UTC(2026, 9, 6, 6, i * 30)).toISOString());
    const { html } = renderEmailEmbed({ ...base, days: [{ date: "2026-10-05", slots: [] }, { date: "2026-10-06", slots }] });
    expect(html).not.toContain("October 5");
    expect(hrefs(html).filter((h) => h.includes("slot=")).length).toBe(MAX_EMAIL_SLOTS);
    const three = renderEmailEmbed({ ...base, maxSlots: 3, days: [{ date: "2026-10-06", slots }] }).html;
    expect(hrefs(three).filter((h) => h.includes("slot=")).length).toBe(3);
  });

  it("says so when nothing is selected", () => {
    const { html, text } = renderEmailEmbed({ ...base, days: [] });
    expect(html).toContain("No times selected.");
    expect(text).toContain("No times selected.");
    expect(hrefs(html)).toEqual(["https://cal.example.com/ada/intro?duration=30"]);
  });

  it("is mail-client safe: tables and inline styles only, no style blocks, classes, scripts or images", () => {
    const { html } = renderEmailEmbed(base);
    expect(html.startsWith("<table")).toBe(true);
    expect(html).not.toMatch(/<style|<script|<img|class=|<link|@import|url\(/i);
    expect(html).toContain("max-width:600px");
    // Every colored text sits on an explicit background (dark-mode inversion keeps contrast).
    expect(html).toContain('bgcolor="#ffffff"');
    expect(html).not.toMatch(/[;"]color:#fff(fff)?;/i);
  });

  it("encodes team and dynamic-group paths and keeps a base path", () => {
    const { html } = renderEmailEmbed({ ...base, appUrl: "https://example.com/cal/", target: { calLink: "team/robin/discovery", label: "Discovery" } });
    expect(hrefs(html)[0]).toBe("https://example.com/cal/team/robin/discovery?date=2026-10-06&slot=2026-10-06T07%3A00%3A00.000Z&duration=30");
  });

  it("rejects invalid inputs", () => {
    expect(() => renderEmailEmbed({ ...base, timeZone: "Mars/Olympus" })).toThrow(EmailEmbedError);
    expect(() => renderEmailEmbed({ ...base, duration: 0 })).toThrow(EmailEmbedError);
    expect(() => renderEmailEmbed({ ...base, target: { calLink: "../x", label: "x" } })).toThrow(EmailEmbedError);
    expect(() => renderEmailEmbed({ ...base, appUrl: "data:text/html,hi" })).toThrow(EmailEmbedError);
  });
});

describe("emailPreviewDocument", () => {
  it("wraps the fragment in a document with a charset", () => {
    const doc = emailPreviewDocument("<table></table>");
    expect(doc).toMatch(/^<!doctype html>/);
    expect(doc).toContain('<meta charset="utf-8">');
    expect(doc).toContain("<table></table></body>");
  });
});
