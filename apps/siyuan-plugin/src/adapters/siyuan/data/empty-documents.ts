import type { BlockRow } from "./source";

/** Document titles and child documents do not count as a document's own body.
 * Unknown/media/widget types are content, even when their plain text is empty. */
export function emptyDocumentIds(blocks: readonly BlockRow[]): Set<string> {
  const empty = new Set(
    blocks.filter((block) => !block.type || block.type === "d").map((block) => block.id),
  );
  for (const block of blocks) {
    if (!block.type || block.type === "d" || !block.root_id || !empty.has(block.root_id)) continue;
    if (/[^\s\u200b\ufeff]/u.test(block.content)) {
      empty.delete(block.root_id);
      continue;
    }
    const container = ["l", "i", "b", "s"].includes(block.type);
    const blankText =
      ["p", "h"].includes(block.type) &&
      typeof block.markdown === "string" &&
      !/[^\s\u200b\ufeff]/u.test(block.markdown);
    if (!container && !blankText) empty.delete(block.root_id);
  }
  return empty;
}
