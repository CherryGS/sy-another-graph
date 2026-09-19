import { getGraphLookups } from "../../core/graph/graph-lookups";
import { isBlock, nodeType, type CurrentGraph } from "../../core/scope/graph-model";
import type { GraphEdge, GraphNode } from "../../core/graph/types";
import type { DiscoveryMatch, DiscoveryRule } from "./types";

export interface ReferenceGraph {
  graph: CurrentGraph;
  documents: readonly GraphNode[];
  documentForNode: ReadonlyMap<string, number>;
  pairs: ReadonlyMap<string, readonly GraphEdge[]>;
  endpoints: Uint32Array;
}
export const referencePair = (source: number, target: number) => `${source}:${target}`;

/** Consume already scoped/projected references only. Grouping never imports
 * other blocks from a document represented by a hidden in-scope source. */
export async function prepareReferences(
  graph: CurrentGraph,
  signal: AbortSignal,
): Promise<ReferenceGraph> {
  signal.throwIfAborted();
  const documents = graph.nodes
    .filter((node) => isBlock(node) && nodeType(node) === "d")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byId = new Map(documents.map((node, index) => [node.id, index]));
  const documentForNode = new Map<string, number>();
  const byIndex = getGraphLookups(graph).byIndex;
  for (let i = 0; i < graph.nodes.length; i++) {
    if (i % 8192 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal.throwIfAborted();
    }
    const node = graph.nodes[i];
    if (!isBlock(node)) continue;
    const document = byId.get(nodeType(node) === "d" ? node.id : (node.rootId ?? ""));
    if (document !== undefined) documentForNode.set(node.id, document);
  }
  const pairs = new Map<string, GraphEdge[]>();
  const numeric: number[] = [];
  for (let i = 0; i < graph.edges.length; i++) {
    if (i % 8192 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal.throwIfAborted();
    }
    const edge = graph.edges[i];
    if (edge.kind !== "reference") continue;
    const from = byIndex.get(edge.source),
      to = byIndex.get(edge.target);
    const source = from && documentForNode.get(from.id),
      target = to && documentForNode.get(to.id);
    if (source === undefined || target === undefined || source === target) continue;
    const key = referencePair(source, target);
    const prior = pairs.get(key);
    if (prior) prior.push(edge);
    else {
      pairs.set(key, [edge]);
      numeric.push(source, target);
    }
  }
  signal.throwIfAborted();
  return { graph, documents, documentForNode, pairs, endpoints: new Uint32Array(numeric) };
}

export function discoverySeeds(index: ReferenceGraph, chosenIds: readonly string[]) {
  const seeds = new Set<number>();
  let skipped = 0;
  for (const id of chosenIds) {
    const document = index.documentForNode.get(id);
    if (document === undefined) skipped++;
    else seeds.add(document);
  }
  return { seeds: [...seeds].sort((a, b) => a - b), skipped };
}

export function supportingEdges(
  index: ReferenceGraph,
  rule: DiscoveryRule,
  seed: number,
  candidate: number,
  support: number,
) {
  return rule === "shared-targets"
    ? [
        index.pairs.get(referencePair(seed, support)) ?? [],
        index.pairs.get(referencePair(candidate, support)) ?? [],
      ]
    : [
        index.pairs.get(referencePair(support, seed)) ?? [],
        index.pairs.get(referencePair(support, candidate)) ?? [],
      ];
}

/** Use actual displayed references as evidence, with a bounded spotlight. */
export function discoverySpotlight(
  index: ReferenceGraph,
  rule: DiscoveryRule,
  candidate: number,
  matches: readonly DiscoveryMatch[],
) {
  const ids = new Set<string>([index.documents[candidate].id]);
  const edges = new Set<GraphEdge>();
  const nodes = getGraphLookups(index.graph).byIndex;
  let omitted = false;
  for (const match of matches) {
    ids.add(index.documents[match.seed].id);
    omitted ||= match.supports.length < match.common;
    for (const support of match.supports) {
      ids.add(index.documents[support].id);
      for (const group of supportingEdges(index, rule, match.seed, candidate, support)) {
        for (const edge of group) {
          if (edges.size >= 2000) {
            omitted = true;
            break;
          }
          edges.add(edge);
          for (const endpoint of [edge.source, edge.target]) {
            const node = nodes.get(endpoint);
            if (node) ids.add(node.id);
          }
        }
      }
    }
  }
  return { ids: [...ids], edges: [...edges], omitted };
}
