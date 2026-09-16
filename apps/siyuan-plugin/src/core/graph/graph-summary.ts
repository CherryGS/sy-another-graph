import { nodeType } from "../scope/graph-model";
import type { GraphNode } from "./types";

export type NodeTypeCounts = readonly (readonly [string, number])[];

const typeCountsCache = new WeakMap<readonly GraphNode[], NodeTypeCounts>();

/** Published node arrays are immutable; preserve first-seen type order for callers. */
export function getNodeTypeCounts(nodes: readonly GraphNode[]): NodeTypeCounts {
  const cached = typeCountsCache.get(nodes);
  if (cached) return cached;
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const type = nodeType(node);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const result = Object.freeze(
    Array.from(counts, ([type, count]) => Object.freeze([type, count] as const)),
  );
  typeCountsCache.set(nodes, result);
  return result;
}
