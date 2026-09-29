import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { EMBED_EVENTS, EMBED_SOURCE, EMBED_VERSION } from "./protocol";

const SOURCE_CODE = readFileSync(fileURLToPath(new URL("../../public/embed.js", import.meta.url)), "utf8");
const MAX_GZIP_BYTES = 15 * 1024; // NFR-003

type Listener = (event: Record<string, unknown>) => void;
type FakeElement = {
  nodeType: 1;
  tagName: string;
  style: Record<string, string>;
  attributes: Record<string, string>;
  children: FakeElement[];
  parentNode: FakeElement | null;
  contentWindow: object;
  setAttribute(name: string, value: string): void;
  appendChild(child: FakeElement): void;
  removeChild(child: FakeElement): void;
};

function element(tagName: string): FakeElement {
  return {
    nodeType: 1,
    tagName,
    style: {},
    attributes: {},
    children: [],
    parentNode: null,
    contentWindow: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
    },
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      child.parentNode = null;
    },
  };
}

type Api = {
  protocolVersion: number;
  origin: string;
  buildUrl(calLink: string, config?: Record<string, unknown>): string;
  inline(options: Record<string, unknown>): { iframe: FakeElement; destroy(): void };
  on(type: string, handler: (event: { type: string; data: Record<string, unknown> }) => void): void;
  off(type: string, handler: (event: { type: string; data: Record<string, unknown> }) => void): void;
};

/** Runs public/embed.js against minimal window/document stubs (no DOM library needed). */
function load(scriptSrc = "https://cal.example/embed.js", timers: { setTimeout: (fn: () => void) => unknown } = { setTimeout }) {
  const listeners: Record<string, Listener[]> = {};
  const customEvents: { type: string; detail: unknown }[] = [];
  const host = element("div");
  const window: Record<string, unknown> = {
    location: { href: "https://host.example/page" },
    addEventListener: (type: string, fn: Listener) => (listeners[type] ??= []).push(fn),
    dispatchEvent: (event: { type: string; detail: unknown }) => customEvents.push(event),
    CustomEvent: class {
      constructor(
        public type: string,
        init: { detail: unknown },
        public detail = init.detail,
      ) {}
    },
  };
  const document = {
    currentScript: { src: scriptSrc },
    readyState: "complete",
    addEventListener: () => undefined,
    querySelector: (selector: string) => (selector === "#host" ? host : null),
    querySelectorAll: () => [],
    createElement: element,
  };
  runInNewContext(SOURCE_CODE, { window, document, URL, setTimeout: timers.setTimeout });
  const api = window.OpenCalendar as Api;
  const post = (event: Record<string, unknown>) => listeners.message?.forEach((fn) => fn(event));
  return { api, host, post, customEvents };
}

const message = (type: string, data: Record<string, unknown> = {}) => ({ source: EMBED_SOURCE, version: EMBED_VERSION, type, data });

describe("public/embed.js", () => {
  it("stays under the 15 KB gzip budget (NFR-003)", () => {
    expect(gzipSync(SOURCE_CODE, { level: 9 }).length).toBeLessThan(MAX_GZIP_BYTES);
  });

  it("knows every protocol event", () => {
    for (const event of EMBED_EVENTS) expect(SOURCE_CODE).toContain(`"${event}"`);
  });

  it("takes the instance origin from its own script URL", () => {
    const { api } = load("https://cal.example:8443/embed.js?v=1");
    expect(api.protocolVersion).toBe(1);
    expect(api.origin).toBe("https://cal.example:8443");
  });

  it("builds embed URLs with options and prefill (EMB-004)", () => {
    const { api } = load();
    const url = new URL(
      api.buildUrl("/ada/intro/", {
        name: "Eve",
        email: "eve@example.com",
        theme: "dark",
        brand: "#ff0066",
        hideDetails: true,
        layout: "column",
        company: "ACME",
        answers: { topics: ["a", "b"] },
        notes: "",
        embed: "0",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://cal.example/ada/intro");
    const params = url.searchParams;
    expect(params.get("embed")).toBe("1");
    expect(params.get("name")).toBe("Eve");
    expect(params.get("email")).toBe("eve@example.com");
    expect(params.get("theme")).toBe("dark");
    expect(params.get("brand")).toBe("ff0066");
    expect(params.get("hideDetails")).toBe("1");
    expect(params.get("layout")).toBe("column");
    expect(params.get("company")).toBe("ACME");
    expect(params.getAll("topics")).toEqual(["a", "b"]);
    expect(params.has("notes")).toBe(false);
    expect(api.buildUrl("ada")).toBe("https://cal.example/ada?embed=1");
  });

  it("passes booking-link parameters: layout, date, month, duration and slot", () => {
    const { api } = load();
    const params = (config: Record<string, unknown>) => new URL(api.buildUrl("ada/intro", config)).searchParams;
    const url = params({ layout: "week", date: "2026-10-01", month: "2026-10", duration: 45, slot: "2026-10-01T09:30:00Z" });
    expect(Object.fromEntries(url)).toEqual({ layout: "week", date: "2026-10-01", month: "2026-10", duration: "45", slot: "2026-10-01T09:30:00Z", embed: "1" });
    expect(params({ layout: "month" }).get("layout")).toBe("month");
    // Epoch milliseconds and Date objects become ISO 8601 UTC starts.
    expect(params({ slot: Date.UTC(2026, 9, 1, 9, 30) }).get("slot")).toBe("2026-10-01T09:30:00.000Z");
    expect(params({ slot: new Date(Date.UTC(2026, 9, 1, 9, 30)) }).get("slot")).toBe("2026-10-01T09:30:00.000Z");
  });

  it("drops an unknown layout and reports it without throwing", () => {
    const deferred: (() => void)[] = [];
    const { api } = load(undefined, { setTimeout: (fn) => deferred.push(fn) });
    expect(new URL(api.buildUrl("ada/intro", { layout: "grid" })).searchParams.has("layout")).toBe(false);
    expect(deferred).toHaveLength(1);
    expect(() => deferred[0]()).toThrow(/layout must be/);
  });

  it("accepts team, group and routing form calLinks", () => {
    const { api } = load();
    const path = (link: string) => new URL(api.buildUrl(link)).pathname;
    expect(path("team/acme")).toBe("/team/acme");
    expect(path("/team/acme/intro/")).toBe("/team/acme/intro");
    expect(path("ada+bob/intro")).toBe("/ada+bob/intro");
    expect(path("ada+bob+cy")).toBe("/ada+bob+cy");
    expect(path("forms/abc_123-x")).toBe("/forms/abc_123-x");
  });

  it("rejects calLinks that could leave the booking pages", () => {
    const { api } = load();
    for (const bad of ["", "https://evil.example/x", "//evil.example", "a/b/c", "../dashboard", "ada/intro?x=1", "team/a/b/c", "forms/a/b", "+ada/x", "ada+/x", "ada++bob", "a+b/c/d", "ada+bob@x/y"]) {
      expect(() => api.buildUrl(bad)).toThrow(/calLink/);
    }
  });

  it("resizes inline frames and forwards trusted messages only (EMB-003, EMB-005)", () => {
    const { api, host, post, customEvents } = load();
    const { iframe } = api.inline({ calLink: "ada/intro", elementOrSelector: "#host", config: { name: "Eve" } });
    expect(host.children).toContain(iframe);
    expect(iframe.attributes.loading).toBe("lazy");
    const handler = vi.fn();
    api.on("dimensionsChanged", handler);
    const all = vi.fn();
    api.on("*", all);

    const valid = { origin: "https://cal.example", source: iframe.contentWindow, data: message("dimensionsChanged", { height: 812.4 }) };
    post({ ...valid, origin: "https://evil.example" });
    post({ ...valid, data: { ...valid.data, source: "other" } });
    post({ ...valid, data: { ...valid.data, version: 2 } });
    post({ ...valid, data: message("notAnEvent") });
    post({ ...valid, source: {} }); // same origin, but not one of our frames
    expect(handler).not.toHaveBeenCalled();
    expect(customEvents).toHaveLength(0);

    post(valid);
    expect(iframe.style.height).toBe("813px");
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: "dimensionsChanged", data: { height: 812.4 } }));
    expect(all).toHaveBeenCalledTimes(1);
    expect(customEvents.map((e) => e.type)).toEqual(["opencalendar:dimensionsChanged"]);

    api.off("dimensionsChanged", handler);
    post({ ...valid, data: message("bookingSuccessful", { uid: "u1" }) });
    post(valid);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(all).toHaveBeenCalledTimes(3);
    expect(customEvents.map((e) => e.type)).toContain("opencalendar:bookingSuccessful");
  });
});
