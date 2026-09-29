import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, markdownToText, MARKDOWN_MAX_LENGTH } from "./markdown";

const html = (source: string) => renderToStaticMarkup(<Markdown source={source} />);

describe("Markdown", () => {
  it("renders paragraphs and line breaks", () => {
    const out = html("one\ntwo\n\nthree");
    expect(out).toContain("<p><span>one</span><span><br/>two</span></p>");
    expect(out).toContain("<p><span>three</span></p>");
  });

  it("renders bold, italic and inline code", () => {
    const out = html("**b** *i* `c*x*`");
    expect(out).toContain("<strong>b</strong>");
    expect(out).toContain("<em>i</em>");
    expect(out).toMatch(/<code[^>]*>c\*x\*<\/code>/);
  });

  it("nests emphasis", () => {
    expect(html("**a *b* c**")).toContain("<strong>a <em>b</em> c</strong>");
    expect(html("*a **b** c*")).toContain("<em>a <strong>b</strong> c</em>");
  });

  it("leaves unmatched markers as text", () => {
    expect(html("2 * 3 and **open")).toContain("2 * 3 and **open");
  });

  it("renders safe links with hardened attributes", () => {
    const out = html("[site](https://example.com/a?b=1) [mail](mailto:a@b.co)");
    expect(out).toContain('<a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer nofollow"');
    expect(out).toContain('href="mailto:a@b.co"');
  });

  it("renders unsafe link targets as text", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "JaVaScript:alert(1)", "/relative", "//evil.example"]) {
      const out = html(`[x](${url})`);
      expect(out).not.toContain("<a");
      expect(out).not.toContain("href");
      expect(out).toContain("[x](");
    }
  });

  it("shows HTML as text", () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });

  it("escapes quotes in link labels and urls", () => {
    const out = html('[a"><b>](https://example.com/"x)');
    expect(out).not.toContain("<b>");
  });

  it("renders lists", () => {
    const out = html("- one\n- **two**\n\n1. first\n2. second");
    expect(out).toContain("<ul");
    expect(out).toContain("<li>one</li>");
    expect(out).toContain("<li><strong>two</strong></li>");
    expect(out).toContain("<ol");
    expect(out).toContain("<li>second</li>");
  });

  it("renders headings as styled paragraphs, never h1-h6", () => {
    const out = html("# Title\ntext");
    expect(out).toContain('<p class="font-medium">Title</p>');
    expect(out).not.toMatch(/<h\d/);
  });

  it("limits the input length", () => {
    const out = html(`${"a".repeat(MARKDOWN_MAX_LENGTH)}TAIL`);
    expect(out).not.toContain("TAIL");
  });
});

describe("markdownToText", () => {
  it("strips formatting for previews", () => {
    expect(markdownToText("# Hi\n**bold** and [link](https://x.co)\n\n- a\n- b `c`")).toBe("Hi bold and link a b c");
  });
});

const render = (source: string) => renderToStaticMarkup(<Markdown source={source} />);

describe("markdown performance (ReDoS)", () => {
  it("renders pathological lines in linear time", () => {
    const started = performance.now();
    render("# a" + " ".repeat(4900) + "x");
    render("# " + "#".repeat(2000) + " ".repeat(2000) + "x");
    render("*".repeat(4000));
    render("[".repeat(2000) + "](".repeat(1000));
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("still strips closing hashes from headings", () => {
    expect(render("## Title ##")).toContain(">Title</p>");
  });
});
