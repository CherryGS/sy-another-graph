import type { GraphEdge, GraphNode } from "./types";

/** Published graph arrays and the facts they contain are immutable. */
export interface GraphLike {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

export interface GraphLookups {
  readonly byId: ReadonlyMap<string, GraphNode>;
  readonly byIndex: ReadonlyMap<number, GraphNode>;
  incidentEdges(index: number): readonly GraphEdge[];
}

interface NodeLookups {
  byId: ReadonlyMap<string, GraphNode>;
  byIndex: ReadonlyMap<number, GraphNode>;
}

const nodeCache = new WeakMap<readonly GraphNode[], NodeLookups>();
const edgeCache = new WeakMap<readonly GraphEdge[], ReadonlyMap<number, readonly GraphEdge[]>>();
const graphCache = new WeakMap<readonly GraphNode[], WeakMap<readonly GraphEdge[], GraphLookups>>();
const searchCache = new WeakMap<readonly GraphNode[], (string | undefined)[]>();
const NO_EDGES: readonly GraphEdge[] = Object.freeze([]);

function nodeLookups(nodes: readonly GraphNode[]): NodeLookups {
  const cached = nodeCache.get(nodes);
  if (cached) return cached;
  const byId = new Map<string, GraphNode>();
  const byIndex = new Map<number, GraphNode>();
  for (const node of nodes) {
    byId.set(node.id, node);
    byIndex.set(node.index, node);
  }
  const result = { byId, byIndex };
  nodeCache.set(nodes, result);
  return result;
}

function incidentIndex(edges: readonly GraphEdge[]) {
  const cached = edgeCache.get(edges);
  if (cached) return cached;
  const incident = new Map<number, GraphEdge[]>();
  const add = (index: number, edge: GraphEdge) => {
    const list = incident.get(index);
    if (list) list.push(edge);
    else incident.set(index, [edge]);
  };
  for (const edge of edges) {
    add(edge.source, edge);
    // A self-reference is one incident relationship, matching the source list.
    if (edge.target !== edge.source) add(edge.target, edge);
  }
  edgeCache.set(edges, incident);
  return incident;
}

/** Reuse node and edge indexes even when a caller constructs a new wrapper. */
export function getGraphLookups(graph: GraphLike): GraphLookups {
  let byEdges = graphCache.get(graph.nodes);
  if (!byEdges) {
    byEdges = new WeakMap();
    graphCache.set(graph.nodes, byEdges);
  }
  const cached = byEdges.get(graph.edges);
  if (cached) return cached;
  const nodes = nodeLookups(graph.nodes);
  const edges = graph.edges;
  const result: GraphLookups = {
    ...nodes,
    // Most readers need only a node. Build the O(E) incident index on first use.
    incidentEdges: (index) => incidentIndex(edges).get(index) ?? NO_EDGES,
  };
  byEdges.set(edges, result);
  return result;
}

/** Match the existing title/ID search order without allocating every match. */
export function searchGraphNodes(
  graph: Pick<GraphLike, "nodes">,
  query: string,
  limit = 30,
): GraphNode[] {
  if (!Number.isSafeInteger(limit) || limit < 0)
    throw new RangeError("Search limit must be a non-negative safe integer");
  const needle = query.trim().toLocaleLowerCase();
  if (!needle || limit === 0) return [];
  let labels = searchCache.get(graph.nodes);
  if (!labels) {
    labels = [];
    searchCache.set(graph.nodes, labels);
  }
  const result: GraphNode[] = [];
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    const label = (labels[index] ??= node.label.toLocaleLowerCase());
    // IDs intentionally keep their original case-sensitive includes semantics.
    if (!label.includes(needle) && !node.id.includes(needle)) continue;
    result.push(node);
    if (result.length === limit) break;
  }
  return result;
}
