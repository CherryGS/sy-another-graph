import type { ProjectionSpec } from "./rules";
import type { GraphNode } from "../graph/types";

export function nodeType(node: GraphNode): string {
  return node.entity && node.entity !== "block" ? node.entity : (node.blockType ?? "d");
}

export function isBlock(node: GraphNode): boolean {
  return !node.entity || node.entity === "block";
}

/** Documents always remain available as representatives for hidden native blocks. */
export function isTypeHidden(filters: ProjectionSpec, type: string): boolean {
  return type !== "d" && (filters.documentsOnly || filters.hiddenTypes.includes(type));
}
