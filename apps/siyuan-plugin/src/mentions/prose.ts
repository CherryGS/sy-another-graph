import { fromMarkdown } from "mdast-util-from-markdown";

// Excluded constructs leave a hard boundary so their surrounding words cannot
// accidentally become a new phrase after code, links, or attributes are removed.
const BOUNDARY = "\uFFFC";
const NATIVE_REFERENCE = /\(\(\d{14}-[a-z0-9]{7}(?:\s+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))?\s*\)\)/g;
const IAL = /\{:\s*(?:[^"'}]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')*\}/g;
const URL = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s\uFFFC]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const EXCLUDED = new Set(["code", "inlineCode", "link", "linkReference", "image", "imageReference", "definition"]);
const PARAGRAPHS = new Set(["paragraph", "heading", "listItem", "tableCell"]);

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
}

/** Parse Markdown as data only. HTML is never rendered and no resources load. */
export function ordinaryProse(markdown: string): string {
  const tree = fromMarkdown(markdown.replace(NATIVE_REFERENCE, BOUNDARY).replace(IAL, BOUNDARY));
  const pieces: string[] = [];
  let htmlDepth = 0;
  const visit = (node: MarkdownNode) => {
    if (EXCLUDED.has(node.type)) {
      pieces.push(BOUNDARY);
      return;
    }
    if (node.type === "html") {
      pieces.push(BOUNDARY);
      for (const tag of (node.value ?? "").matchAll(/<\s*(\/?)([a-z][\w-]*)\b[^>]*>/gi)) {
        if (/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tag[2]) || /\/\s*>$/.test(tag[0])) continue;
        htmlDepth = Math.max(0, htmlDepth + (tag[1] ? -1 : 1));
      }
      return;
    }
    if (node.type === "text" && !htmlDepth) pieces.push((node.value ?? "").replace(URL, BOUNDARY));
    if (node.type === "break") pieces.push(" ");
    if (node.children) for (const child of node.children) visit(child);
    if (PARAGRAPHS.has(node.type)) {
      pieces.push(BOUNDARY);
      htmlDepth = 0;
    }
  };
  visit(tree);
  return pieces.join("").replace(/[\s\u200B]+/g, " ").trim();
}

function decodeAttribute(value: string): string {
  const entities: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
  return value.replace(/\\(["\\])/g, "$1").replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (literal, code: string) => {
    if (!code.startsWith("#")) return entities[code.toLowerCase()] ?? literal;
    const number = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number) : literal;
  });
}

export function nativeNames(title: string, ial: string): string[] {
  const attributes = new Map<string, string>();
  for (const match of ial.matchAll(/(?:^|\s)([\w-]+)="((?:\\.|[^"\\])*)"/g))
    attributes.set(match[1], decodeAttribute(match[2]));
  const aliases = (attributes.get("alias") ?? "").match(/(?:\\.|[^,])+/g) ?? [];
  return [...new Set([title, attributes.get("name") ?? "", ...aliases.map(alias => alias.replace(/\\,/g, ","))]
    .map(name => name.replace(/[\s\u200B]+/g, " ").trim()).filter(Boolean))];
}
