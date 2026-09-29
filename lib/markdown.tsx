import type { ReactNode } from "react";

/**
 * Small, safe Markdown subset for event-type descriptions (EVT-001): paragraphs, line breaks,
 * **bold**, *italic*, `code`, [links](https://…), lists and headings. Output is built as React
 * elements only, so any other text (including raw HTML) is escaped by React.
 */

export const MARKDOWN_MAX_LENGTH = 5000;
const MAX_DEPTH = 5;
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

type Inline = string | { kind: "strong" | "em" | "code"; children: Inline[] } | { kind: "link"; href: string; children: Inline[] };
type Block =
  | { kind: "p"; lines: Inline[][] }
  | { kind: "h"; children: Inline[] }
  | { kind: "ul" | "ol"; items: Inline[][] };

function safeHref(raw: string): string | null {
  if (!raw || /\s/.test(raw)) return null;
  try {
    const url = new URL(raw);
    return SAFE_LINK_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Index of the closing marker, skipping `**` pairs while looking for a single `*`. */
function findClose(text: string, from: number, marker: "*" | "**"): number {
  for (let k = from; k < text.length; k++) {
    if (text[k] === "`") {
      const end = text.indexOf("`", k + 1);
      if (end > 0) k = end;
    } else if (marker === "**" ? text.startsWith("**", k) : text[k] === "*" && text[k + 1] !== "*") {
      return k;
    } else if (marker === "*" && text.startsWith("**", k)) {
      k += 1;
    }
  }
  return -1;
}

function parseInline(text: string, depth = 0, inLink = false): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push(buffer);
    buffer = "";
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ kind: "code", children: [text.slice(i + 1, end)] });
        i = end + 1;
        continue;
      }
    } else if ((ch === "*" || ch === "[") && depth < MAX_DEPTH) {
      if (ch === "*") {
        const marker = text.startsWith("**", i) ? "**" : "*";
        const end = findClose(text, i + marker.length, marker);
        if (end > i + marker.length) {
          flush();
          out.push({ kind: marker === "**" ? "strong" : "em", children: parseInline(text.slice(i + marker.length, end), depth + 1, inLink) });
          i = end + marker.length;
          continue;
        }
        if (marker === "**") {
          buffer += "**";
          i += 2;
          continue;
        }
      } else if (!inLink) {
        const close = text.indexOf("](", i + 1);
        const end = close > 0 ? text.indexOf(")", close + 2) : -1;
        if (end > 0) {
          const label = text.slice(i + 1, close);
          const href = safeHref(text.slice(close + 2, end));
          if (href && label.trim() && !label.includes("[")) {
            flush();
            out.push({ kind: "link", href, children: parseInline(label, depth + 1, true) });
            i = end + 1;
            continue;
          }
        }
      }
    }
    buffer += ch;
    i += 1;
  }
  flush();
  return out;
}

// Linear-time patterns only (no nested or adjacent unbounded quantifiers): descriptions are
// user input rendered on public pages, so a crafted line must not stall the server (ReDoS).
const HEADING = /^ {0,3}#{1,6}[ \t]+(.*)$/;

/** "Title ##" → "Title": closing hashes stripped without a backtracking regex. */
function headingText(raw: string): string {
  let end = raw.length;
  while (end > 0 && (raw[end - 1] === " " || raw[end - 1] === "\t")) end--;
  let hashes = end;
  while (hashes > 0 && raw[hashes - 1] === "#") hashes--;
  if (hashes < end && (hashes === 0 || raw[hashes - 1] === " " || raw[hashes - 1] === "\t")) end = hashes;
  return raw.slice(0, end).trim();
}
const UL = /^ {0,3}[-*+]\s+(.*)$/;
const OL = /^ {0,3}\d{1,9}[.)]\s+(.*)$/;

function parseBlocks(source: string): Block[] {
  const lines = source.slice(0, MARKDOWN_MAX_LENGTH).replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "p", lines: paragraph.map((l) => parseInline(l.trim())) });
    paragraph = [];
  };
  for (const line of lines) {
    const heading = HEADING.exec(line);
    const ul = UL.exec(line);
    const ol = OL.exec(line);
    const list = ul ? { kind: "ul" as const, text: ul[1]! } : ol ? { kind: "ol" as const, text: ol[1]! } : null;
    if (!line.trim()) {
      endParagraph();
    } else if (heading) {
      endParagraph();
      blocks.push({ kind: "h", children: parseInline(headingText(heading[1]!)) });
    } else if (list) {
      endParagraph();
      const last = blocks.at(-1);
      const item = parseInline(list.text.trim());
      if (last && last.kind === list.kind) last.items.push(item);
      else blocks.push({ kind: list.kind, items: [item] });
    } else {
      paragraph.push(line);
    }
  }
  endParagraph();
  return blocks;
}

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, i) => {
    if (typeof node === "string") return node;
    const children = renderInline(node.children);
    switch (node.kind) {
      case "strong":
        return <strong key={i}>{children}</strong>;
      case "em":
        return <em key={i}>{children}</em>;
      case "code":
        return (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
            {children}
          </code>
        );
      case "link":
        return (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
            {children}
          </a>
        );
    }
  });
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.kind) {
    case "h":
      // A styled paragraph, not a heading element, so the page's heading order is never disturbed.
      return (
        <p key={key} className="font-medium">
          {renderInline(block.children)}
        </p>
      );
    case "p":
      return (
        <p key={key}>
          {block.lines.map((line, i) => (
            <span key={i}>
              {i > 0 && <br />}
              {renderInline(line)}
            </span>
          ))}
        </p>
      );
    case "ul":
    case "ol": {
      const List = block.kind;
      return (
        <List key={key} className={block.kind === "ul" ? "list-disc pl-5" : "list-decimal pl-5"}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </List>
      );
    }
  }
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}>{parseBlocks(source).map(renderBlock)}</div>;
}

function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (typeof n === "string" ? n : inlineText(n.children))).join("");
}

/** Plain-text version (formatting removed, blocks separated by spaces) for line-clamped previews. */
export function markdownToText(source: string): string {
  return parseBlocks(source)
    .flatMap((b) => (b.kind === "p" ? b.lines.map(inlineText) : b.kind === "h" ? [inlineText(b.children)] : b.items.map(inlineText)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
