/*! OpenCalendar embed loader, protocol v1 | AGPL-3.0-only | docs/03-architecture/embeds.md */
(function (w, d) {
  "use strict";
  if (w.OpenCalendar && w.OpenCalendar.protocolVersion) return;

  var SOURCE = "opencalendar";
  var VERSION = 1;
  var EVENTS = ["ready", "dateSelected", "slotSelected", "bookingSuccessful", "bookingFailed", "dimensionsChanged"];
  var Z = 2147483000;
  var LAYOUTS = ["month", "week", "column"];
  var script = d.currentScript;
  // The instance origin comes from this script's own URL; only its messages are trusted (EMB-003).
  var origin = new URL(script && script.src ? script.src : w.location.href).origin;
  var handlers = {};
  var frames = [];
  var modal = null;

  function fail(message) {
    throw new Error("OpenCalendar: " + message);
  }

  function css(el, text) {
    // CSSOM assignment is allowed under strict host CSPs (unlike style attributes or <style>).
    el.style.cssText = text;
    return el;
  }

  function onReady(fn) {
    if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function report(error) {
    // Surface integration mistakes in the console without breaking the host page.
    setTimeout(function () {
      throw error;
    });
  }

  /**
   * Allowed shapes: user, user/event, a+b/event (group), team/slug[/event], forms/id. Config keys
   * become query parameters (date, month, duration, slot, layout, prefill answers, theme…).
   */
  function buildUrl(calLink, config) {
    var path = String(calLink || "").replace(/^\/+|\/+$/g, "");
    if (!/^(team\/[\w-]+(\/[\w-]+)?|forms\/[\w-]+|[\w-]+(\+[\w-]+)*(\/[\w-]+)?)$/.test(path))
      fail('calLink must look like "username", "username/event-slug", "team/slug/event-slug", "a+b/event-slug" or "forms/id"');
    var url = new URL("/" + path, origin);
    var params = url.searchParams;
    var set = function (key, value) {
      if (value === undefined || value === null || value === "" || value === false) return;
      if (Array.isArray(value)) {
        params.delete(key);
        value.forEach(function (v) {
          params.append(key, String(v));
        });
      } else {
        params.set(key, value === true ? "1" : String(value));
      }
    };
    var cfg = config || {};
    Object.keys(cfg).forEach(function (key) {
      var value = cfg[key];
      if (key === "answers" && value && typeof value === "object" && !Array.isArray(value)) {
        Object.keys(value).forEach(function (k) {
          set(k, value[k]);
        });
      } else if (key === "brand" && value) {
        set(key, String(value).replace(/^#/, ""));
      } else if (key === "layout" && value) {
        if (LAYOUTS.indexOf(value) >= 0) set(key, value);
        else report(new Error('OpenCalendar: layout must be "month", "week" or "column"'));
      } else if (key === "slot" && value) {
        // A Date or epoch milliseconds becomes the ISO 8601 UTC start the page expects.
        var ms = Object.prototype.toString.call(value) === "[object Date]" ? value.getTime() : typeof value === "number" ? value : NaN;
        set(key, isFinite(ms) ? new Date(ms).toISOString() : value);
      } else if (key !== "embed" && key !== "title") {
        set(key, value);
      }
    });
    params.set("embed", "1");
    return url.href;
  }

  function createFrame(calLink, config) {
    var frame = d.createElement("iframe");
    frame.src = buildUrl(calLink, config);
    frame.title = (config && config.title) || "Booking page";
    frame.setAttribute("loading", "lazy");
    frames.push(frame);
    return frame;
  }

  function forget(frame) {
    frames = frames.filter(function (f) {
      return f !== frame;
    });
    if (frame.parentNode) frame.parentNode.removeChild(frame);
  }

  function resolveElement(target) {
    var el = typeof target === "string" ? d.querySelector(target) : target;
    if (!el || el.nodeType !== 1) fail("element not found: " + target);
    return el;
  }

  /** EMB-001: renders the booking page inside a host element; the height follows the content. */
  function inline(options) {
    var opts = options || {};
    var el = resolveElement(opts.elementOrSelector);
    var frame = createFrame(opts.calLink, opts.config);
    frame.ocInline = true;
    css(frame, "display:block;width:100%;height:" + (opts.height || 640) + "px;border:0;overflow:hidden;color-scheme:normal");
    el.appendChild(frame);
    return {
      iframe: frame,
      destroy: function () {
        forget(frame);
      },
    };
  }

  function closePopup() {
    if (!modal) return;
    var m = modal;
    modal = null;
    w.removeEventListener("resize", m.onResize);
    d.removeEventListener("keydown", m.onKey, true);
    d.removeEventListener("focusin", m.onFocus, true);
    forget(m.frame);
    if (m.overlay.parentNode) m.overlay.parentNode.removeChild(m.overlay);
    d.body.style.overflow = m.overflow;
    if (m.restore && typeof m.restore.focus === "function") m.restore.focus();
  }

  // Phones get the popup full screen: every pixel goes to the booking page (less scrolling).
  var PHONE = "(max-width: 639px)";
  var POPUP_MAX_HEIGHT = 760;

  /** Sizes the popup: full screen on phones; elsewhere as tall as its content, within the screen. */
  function layoutPopup(m) {
    var phone = w.matchMedia && w.matchMedia(PHONE).matches;
    css(
      m.overlay,
      "position:fixed;top:0;right:0;bottom:0;left:0;z-index:" + Z + ";pointer-events:auto;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:" +
        (phone ? "0" : "16px"),
    );
    var height = phone ? "100%" : m.contentHeight ? "min(" + Math.min(m.contentHeight, POPUP_MAX_HEIGHT) + "px,100%)" : "min(" + POPUP_MAX_HEIGHT + "px,100%)";
    css(
      m.dialog,
      "position:relative;width:100%;max-width:" + (phone ? "none" : "1000px") + ";height:" + height + ";border-radius:" + (phone ? "0" : "12px") +
        ";box-shadow:0 20px 50px rgba(0,0,0,.35);transition:height .15s ease-out;background:" + m.background,
    );
    css(m.frame, "display:block;width:100%;height:100%;border:0;border-radius:" + (phone ? "0" : "12px"));
    // On a phone the close button sits inside the screen, with a 44px touch target.
    css(
      m.close,
      phone
        ? "position:absolute;top:6px;right:6px;width:44px;height:44px;border-radius:50%;border:0;cursor:pointer;font:24px/44px sans-serif;padding:0;background:rgba(255,255,255,.9);color:#111;box-shadow:0 1px 4px rgba(0,0,0,.25)"
        : "position:absolute;top:-12px;right:-12px;width:32px;height:32px;border-radius:50%;border:0;cursor:pointer;font:20px/32px sans-serif;padding:0;background:#fff;color:#111;box-shadow:0 2px 8px rgba(0,0,0,.3)",
    );
  }

  /** EMB-002: accessible modal dialog with the booking page. */
  function popup(options) {
    var opts = options || {};
    closePopup();
    var config = opts.config || {};
    var dark = config.theme === "dark" || (config.theme !== "light" && w.matchMedia && w.matchMedia("(prefers-color-scheme: dark)").matches);
    var frame = createFrame(opts.calLink, config);
    // The overlay sets pointer-events:auto (layoutPopup): it must not inherit a host page's lock.
    // Modal libraries (Radix, Headless UI…) set body { pointer-events: none } while their dialog is
    // open or closing, and a partner site often opens this popup from such a dialog; inheriting it
    // left every tap inside the popup dead, which iOS Safari can keep even after the lock lifts.
    var overlay = d.createElement("div");
    var dialog = d.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", opts.label || "Book a meeting");
    var close = d.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    close.addEventListener("click", closePopup);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closePopup();
    });
    dialog.appendChild(frame);
    dialog.appendChild(close);
    overlay.appendChild(dialog);
    modal = {
      frame: frame,
      overlay: overlay,
      dialog: dialog,
      close: close,
      background: dark ? "#0b0b0f" : "#fff",
      contentHeight: 0,
      onResize: function () {
        if (modal) layoutPopup(modal);
      },
      overflow: d.body.style.overflow,
      restore: d.activeElement,
      onKey: function (e) {
        if (e.key === "Escape") {
          e.preventDefault();
          closePopup();
        } else if (e.key === "Tab" && d.activeElement === close) {
          // Only two stops: the close button and the booking frame.
          e.preventDefault();
          frame.focus();
        }
      },
      onFocus: function (e) {
        if (!dialog.contains(e.target)) close.focus();
      },
    };
    layoutPopup(modal);
    w.addEventListener("resize", modal.onResize);
    d.addEventListener("keydown", modal.onKey, true);
    d.addEventListener("focusin", modal.onFocus, true);
    d.body.style.overflow = "hidden";
    d.body.appendChild(overlay);
    close.focus();
    return { iframe: frame, close: closePopup };
  }

  function readableText(hex) {
    var h = hex.length === 3 ? hex.replace(/./g, "$&$&") : hex;
    var n = parseInt(h.slice(0, 6), 16);
    var luminance = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return luminance > 160 ? "#111" : "#fff";
  }

  /** EMB-002: fixed button that opens the popup. */
  function floatingButton(options) {
    var opts = options || {};
    var hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(opts.color || "") ? opts.color.replace(/^#/, "") : "111827";
    var side = opts.position === "bottom-left" ? "left" : "right";
    buildUrl(opts.calLink); // validate early
    var button = css(
      d.createElement("button"),
      "position:fixed;bottom:20px;" + side + ":20px;z-index:" + (Z - 1) + ";padding:12px 20px;border:0;border-radius:999px;cursor:pointer;" +
        "font:600 15px/1.2 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);background:#" + hex + ";color:" + readableText(hex),
    );
    button.type = "button";
    button.textContent = opts.text || "Book a meeting";
    button.addEventListener("click", function () {
      popup({ calLink: opts.calLink, config: opts.config });
    });
    onReady(function () {
      d.body.appendChild(button);
    });
    return {
      button: button,
      remove: function () {
        if (button.parentNode) button.parentNode.removeChild(button);
      },
    };
  }

  function on(type, handler) {
    (handlers[type] = handlers[type] || []).push(handler);
  }

  function off(type, handler) {
    handlers[type] = (handlers[type] || []).filter(function (h) {
      return h !== handler;
    });
  }

  function dispatch(event) {
    (handlers[event.type] || []).concat(handlers["*"] || []).forEach(function (h) {
      try {
        h(event);
      } catch (error) {
        report(error);
      }
    });
    if (typeof w.CustomEvent === "function") w.dispatchEvent(new w.CustomEvent("opencalendar:" + event.type, { detail: event }));
  }

  // EMB-003: accept only v1 protocol messages from this instance's origin and our own frames.
  w.addEventListener("message", function (e) {
    var msg = e.data;
    if (e.origin !== origin || !msg || msg.source !== SOURCE || msg.version !== VERSION || EVENTS.indexOf(msg.type) < 0) return;
    var frame = frames.filter(function (f) {
      return f.contentWindow === e.source;
    })[0];
    if (!frame) return;
    var data = msg.data && typeof msg.data === "object" ? msg.data : {};
    var height = Number(data.height);
    // EMB-005: inline frames grow and shrink with the booking page; the popup fits its content.
    if (msg.type === "dimensionsChanged" && height > 0 && height < 100000) {
      if (frame.ocInline) frame.style.height = Math.ceil(height) + "px";
      else if (modal && modal.frame === frame) {
        modal.contentHeight = Math.ceil(height);
        layoutPopup(modal);
      }
    }
    dispatch({ type: msg.type, data: data, version: VERSION, iframe: frame });
  });

  function readConfig(el) {
    var raw = el.getAttribute("data-opencalendar-config");
    if (!raw) return {};
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      report(new Error("OpenCalendar: data-opencalendar-config is not valid JSON"));
      return {};
    }
  }

  // Auto-init: any [data-opencalendar-link] opens the popup (delegated, so late elements work).
  d.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("[data-opencalendar-link]") : null;
    if (!el) return;
    e.preventDefault();
    try {
      popup({ calLink: el.getAttribute("data-opencalendar-link"), config: readConfig(el) });
    } catch (error) {
      report(error);
    }
  });

  // Auto-init: <div data-opencalendar-inline="user/event"> renders inline without extra script.
  onReady(function () {
    var nodes = d.querySelectorAll("[data-opencalendar-inline]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute("data-opencalendar-ready")) continue;
      el.setAttribute("data-opencalendar-ready", "1");
      try {
        inline({ calLink: el.getAttribute("data-opencalendar-inline"), elementOrSelector: el, config: readConfig(el) });
      } catch (error) {
        report(error);
      }
    }
  });

  w.OpenCalendar = {
    protocolVersion: VERSION,
    origin: origin,
    inline: inline,
    popup: popup,
    closePopup: closePopup,
    floatingButton: floatingButton,
    on: on,
    off: off,
    buildUrl: buildUrl,
  };
})(window, document);
