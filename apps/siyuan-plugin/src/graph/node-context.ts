import type { CanvasNode } from "./types";
import { nodeType } from "../data/graph-model";
import { NODE_TYPE_LABELS } from "../data/labels";

/** Context is rendered as text, never as source HTML or Markdown. */
export function nodeContext(
  node: CanvasNode,
  notebookNames: Readonly<Record<string, string>> = {},
) {
  const type = nodeType(node);
  const typeLabel = Object.hasOwn(NODE_TYPE_LABELS, type)
    ? NODE_TYPE_LABELS[type]
    : type;
  const notebook = notebookNames[node.notebook];
  const lines = [notebook ? `${typeLabel} · ${notebook}` : typeLabel];
  if (node.external) lines.push("↗ 范围外补充节点");
  if (node.documentLabel && node.documentLabel !== node.label)
    lines.push(node.documentLabel);
  if (node.heading && node.heading !== node.label) lines.push(node.heading);
  const path = node.humanPath || node.path;
  if (path) lines.push(path);
  const content = node.content?.replace(/\s+/g, " ").trim();
  if (content && content !== node.label)
    lines.push(content.length > 360 ? `${content.slice(0, 360)}…` : content);
  return { title: node.label || node.id, lines: [...new Set(lines)] };
}
