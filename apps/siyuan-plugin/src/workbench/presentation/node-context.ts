import type { CanvasNode } from "./types";
import { nodeType } from "../../core/scope/graph-model";
import { NODE_TYPE_LABELS } from "./graph-labels";
import { searchOriginDescription, type SearchOrigins } from "../../modules/search/origins";

/** Context is rendered as text, never as source HTML or Markdown. */
export function nodeContext(
  node: CanvasNode,
  notebookNames: Readonly<Record<string, string>> = {},
  searchOrigins?: SearchOrigins,
) {
  const type = nodeType(node);
  const typeLabel = Object.hasOwn(NODE_TYPE_LABELS, type) ? NODE_TYPE_LABELS[type] : type;
  const notebook = notebookNames[node.notebook];
  const lines = [notebook ? `${typeLabel} · ${notebook}` : typeLabel];
  const origin = searchOriginDescription(node.id, searchOrigins);
  if (origin) lines.push(origin);
  if (node.documentLabel && node.documentLabel !== node.label) lines.push(node.documentLabel);
  if (node.heading && node.heading !== node.label) lines.push(node.heading);
  const path = node.humanPath || node.path;
  if (path) lines.push(path);
  const content = node.content?.replace(/\s+/g, " ").trim();
  if (content && content !== node.label)
    lines.push(content.length > 360 ? `${content.slice(0, 360)}…` : content);
  return { title: node.label || node.id, lines: [...new Set(lines)] };
}
