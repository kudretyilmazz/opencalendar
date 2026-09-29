import { describe, expect, it } from "vitest";
import { DEFAULT_EMBED_OPTIONS, type EmbedOptions } from "./options";
import {
  bookingPageUrl,
  embedConfig,
  escapeHtml,
  floatingButtonArgs,
  generateSnippet,
  jsonAttribute,
  jsonScript,
  normalizeAppUrl,
  type SnippetInput,
} from "./snippets";

const APP = "https://cal.example.com/";
const eventType = { kind: "eventType" as const, calLink: "ada/intro", label: "Intro call" };
const form = { kind: "form" as const, calLink: "forms/f_1", label: "Contact" };

const snippet = (over: Partial<SnippetInput> & { options?: Partial<EmbedOptions> }) =>
  generateSnippet({
    appUrl: APP,
    target: eventType,
    mode: "inline",
    format: "html",
    ...over,
    options: over.options ?? {},
  });

describe("escaping", () => {
  it("escapes HTML text and attributes", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("escapes & before ' in JSON for single-quoted attributes", () => {
    expect(jsonAttribute({ name: "O'Neil & Co &#39;" })).toBe('{"name":"O&#39;Neil &amp; Co &amp;#39;"}');
  });

  it("keeps JSON in scripts from closing the script element", () => {
    const out = jsonScript({ text: "</script><!-- & \u2028" });
    expect(out).not.toMatch(/<|>|&|\u2028/);
    expect(JSON.parse(out)).toEqual({ text: "</script><!-- & \u2028" });
  });

  it("normalizes the instance URL", () => {
    expect(normalizeAppUrl("https://cal.example.com/")).toBe("https://cal.example.com");
    expect(() => normalizeAppUrl("javascript:alert(1)")).toThrow();
  });
});

describe("embedConfig", () => {
  it("omits defaults", () => {
    expect(embedConfig(eventType, DEFAULT_EMBED_OPTIONS)).toEqual({});
    expect(embedConfig(eventType, {})).toEqual({});
  });

  it("emits only loader keys", () => {
    const config = embedConfig(eventType, {
      ...DEFAULT_EMBED_OPTIONS,
      theme: "dark",
      brand: "#0F766E",
      layout: "week",
      hideDetails: true,
      name: "Eve",
      email: "eve@example.com",
      buttonText: "Hi",
      height: 900,
    });
    expect(config).toEqual({
      theme: "dark",
      brand: "#0f766e",
      layout: "week",
      hideDetails: true,
      name: "Eve",
      email: "eve@example.com",
    });
  });

  it("keeps only theme and brand for routing forms", () => {
    expect(
      embedConfig(form, { theme: "light", brand: "#112233", layout: "column", hideDetails: true, name: "Eve" }),
    ).toEqual({ theme: "light", brand: "#112233" });
  });

  it("drops invalid values", () => {
    expect(embedConfig(eventType, { theme: "neon" as never, brand: "red", email: "nope" })).toEqual({});
  });
});

describe("inline snippet", () => {
  it("is the auto-init div plus the async loader, with the container size", () => {
    expect(snippet({})).toBe(
      [
        '<div data-opencalendar-inline="ada/intro" style="width:100%;height:640px;overflow:auto"></div>',
        '<script src="https://cal.example.com/embed.js" async></script>',
      ].join("\n"),
    );
  });

  it("puts escaped config JSON in a single-quoted attribute", () => {
    const out = snippet({ options: { theme: "dark", name: "O'Neil & <Co>", width: "80%", height: 900 } });
    expect(out).toContain(`data-opencalendar-config='{"theme":"dark","name":"O&#39;Neil &amp; <Co>"}'`);
    expect(out).toContain('style="width:80%;height:900px;overflow:auto"');
    // Browsers decode the attribute back to the original JSON.
    const raw = /data-opencalendar-config='([^']*)'/.exec(out)![1];
    expect(JSON.parse(raw.replace(/&#39;/g, "'").replace(/&amp;/g, "&"))).toEqual({
      theme: "dark",
      name: "O'Neil & <Co>",
    });
  });
});

describe("popup snippet", () => {
  it("is a button with the link and escaped text", () => {
    expect(snippet({ mode: "popup", options: { buttonText: "Book <now>", layout: "column" } })).toBe(
      [
        `<button type="button" data-opencalendar-link="ada/intro" data-opencalendar-config='{"layout":"column"}'>Book &lt;now&gt;</button>`,
        '<script src="https://cal.example.com/embed.js" async></script>',
      ].join("\n"),
    );
  });

  it("uses the default text", () => {
    expect(snippet({ mode: "popup" })).toContain(">Book a meeting</button>");
  });
});

describe("floating button snippet", () => {
  it("loads the loader synchronously and calls floatingButton with only the calLink by default", () => {
    expect(snippet({ mode: "floating" })).toBe(
      [
        '<script src="https://cal.example.com/embed.js"></script>',
        "<script>",
        "  OpenCalendar.floatingButton({",
        '    "calLink": "ada/intro"',
        "  });",
        "</script>",
      ].join("\n"),
    );
  });

  it("passes text, color, position and config", () => {
    expect(
      floatingButtonArgs(eventType, {
        buttonText: "Talk",
        buttonColor: "#0f766e",
        buttonPosition: "bottom-left",
        theme: "light",
      }),
    ).toEqual({
      calLink: "ada/intro",
      text: "Talk",
      color: "#0f766e",
      position: "bottom-left",
      config: { theme: "light" },
    });
    expect(floatingButtonArgs(eventType, { buttonPosition: "bottom-right", buttonText: "Book a meeting" })).toEqual({
      calLink: "ada/intro",
    });
  });

  it("cannot break out of the script element", () => {
    const out = snippet({ mode: "floating", options: { buttonText: "</script><script>alert(1)</script>" } });
    expect(out.match(/<\/script>/g)).toHaveLength(2);
    expect(out).toContain("\\u003c/script\\u003e");
  });
});

describe("iframe and link", () => {
  it("builds the same URL as the loader", () => {
    expect(
      bookingPageUrl(APP, eventType, { theme: "dark", brand: "#0f766e", hideDetails: true, layout: "week" }, true),
    ).toBe("https://cal.example.com/ada/intro?theme=dark&brand=0f766e&layout=week&hideDetails=1&embed=1");
  });

  it("iframe snippet", () => {
    expect(snippet({ format: "iframe", options: { width: "600px", height: 700, name: "Eve" } })).toBe(
      '<iframe src="https://cal.example.com/ada/intro?name=Eve&amp;embed=1" title="Intro call" width="600" height="700" style="border:0" loading="lazy"></iframe>',
    );
  });

  it("escapes the iframe title", () => {
    expect(
      generateSnippet({
        appUrl: APP,
        target: { ...form, label: `"><script>` },
        mode: "inline",
        format: "iframe",
        options: {},
      }),
    ).toContain('title="&quot;&gt;&lt;script&gt;"');
  });

  it("plain link keeps only full-page parameters", () => {
    expect(snippet({ format: "link" })).toBe("https://cal.example.com/ada/intro");
    expect(
      snippet({
        format: "link",
        mode: "popup",
        options: { theme: "dark", brand: "#0f766e", layout: "column", email: "eve@example.com" },
      }),
    ).toBe("https://cal.example.com/ada/intro?layout=column&email=eve%40example.com");
  });

  it("the format wins over the mode", () => {
    expect(snippet({ mode: "floating", format: "link" })).toBe("https://cal.example.com/ada/intro");
  });
});

describe("validation", () => {
  it("refuses a calLink the loader would reject", () => {
    expect(() => snippet({ target: { ...eventType, calLink: "https://evil.example" } })).toThrow(/calLink/);
    expect(() => snippet({ target: { ...eventType, calLink: `ada" onload="x` }, format: "link" })).toThrow(/calLink/);
  });

  it("works for every target kind", () => {
    for (const calLink of ["ada", "ada+bob/intro", "team/acme", "team/acme/intro", "forms/f_1"]) {
      expect(snippet({ target: { kind: "profile", calLink, label: "x" } })).toContain(
        `data-opencalendar-inline="${calLink}"`,
      );
    }
  });
});
