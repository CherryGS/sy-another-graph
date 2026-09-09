import type { GraphLike } from "./graph-lookups";
import { nodeType } from "./graph-model";
import type { GraphEdge, GraphNode } from "./types";

export type NodeTypeCounts = readonly (readonly [string, number])[];

export interface GraphSummary {
  readonly isolated: number;
  readonly connected: number;
  readonly references: number;
  readonly referenceRecords: number;
  readonly coverage: number;
  readonly averageDegree: number;
  readonly topNodes: readonly GraphNode[];
}

const typeCountsCache = new WeakMap<readonly GraphNode[], NodeTypeCounts>();
const summaryCache = new WeakMap<
  readonly GraphNode[],
  WeakMap<readonly GraphEdge[], WeakMap<Uint32Array, GraphSummary>>
>();
const HUB_LIMIT = 8;

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

/** Reuse summaries across panel mounts without keeping obsolete graph arrays alive. */
export function getGraphSummary(
  graph: GraphLike,
  degrees: Uint32Array,
): GraphSummary {
  let byEdges = summaryCache.get(graph.nodes);
  if (!byEdges) {
    byEdges = new WeakMap();
    summaryCache.set(graph.nodes, byEdges);
  }
  let byDegrees = byEdges.get(graph.edges);
  if (!byDegrees) {
    byDegrees = new WeakMap();
    byEdges.set(graph.edges, byDegrees);
  }
  const cached = byDegrees.get(degrees);
  if (cached) return cached;

  let isolated = 0;
  const topNodes: GraphNode[] = [];
  for (const node of graph.nodes) {
    if (node.degree === 0) isolated += 1;
    if (topNodes.length === HUB_LIMIT && node.degree <= topNodes[HUB_LIMIT - 1].degree)
      continue;
    const position = topNodes.findIndex((candidate) => node.degree > candidate.degree);
    // Strictly greater comparison leaves equal-degree nodes in source order.
    topNodes.splice(position < 0 ? topNodes.length : position, 0, node);
    if (topNodes.length > HUB_LIMIT) topNodes.pop();
  }

  let references = 0;
  let referenceRecords = 0;
  for (const edge of graph.edges) {
    if (edge.kind !== "reference") continue;
    references += 1;
    referenceRecords += edge.weight;
  }
  // Worker degrees reflect its deduplicated topology; node.degree is a different metric.
  let degreeTotal = 0;
  for (const degree of degrees) degreeTotal += degree;
  const connected = graph.nodes.length - isolated;
  const result: GraphSummary = Object.freeze({
    isolated,
    connected,
    references,
    referenceRecords,
    coverage: graph.nodes.length ? (connected / graph.nodes.length) * 100 : 0,
    averageDegree: graph.nodes.length ? degreeTotal / graph.nodes.length : 0,
    topNodes: Object.freeze(topNodes),
  });
  byDegrees.set(degrees, result);
  return result;
}
