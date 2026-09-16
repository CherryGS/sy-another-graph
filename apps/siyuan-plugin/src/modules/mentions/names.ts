function decodeAttribute(value: string): string {
  const entities: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
  return value
    .replace(/\\(["\\])/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (literal, code: string) => {
      if (!code.startsWith("#")) return entities[code.toLowerCase()] ?? literal;
      const number =
        code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
        ? String.fromCodePoint(number)
        : literal;
    });
}

/** Shared by actual indexing and preview; no Markdown parser or body is needed. */
export function nativeNames(title: string, ial: string): string[] {
  const attributes = new Map<string, string>();
  for (const match of ial.matchAll(/(?:^|\s)([\w-]+)="((?:\\.|[^"\\])*)"/g))
    attributes.set(match[1], decodeAttribute(match[2]));
  const aliases = (attributes.get("alias") ?? "").match(/(?:\\.|[^,])+/g) ?? [];
  return [
    ...new Set(
      [title, attributes.get("name") ?? "", ...aliases.map((alias) => alias.replace(/\\,/g, ","))]
        .map((name) => name.replace(/[\s\u200B]+/g, " ").trim())
        .filter(Boolean),
    ),
  ];
}
