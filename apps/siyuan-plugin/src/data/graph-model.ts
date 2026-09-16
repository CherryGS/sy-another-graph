import type { GraphDataset, GraphEdge, GraphFilters, GraphNode, GraphProvenance } from "./types";
import { getGraphLookups, type GraphLike } from "./graph-lookups";
import { isTypeHidden } from "./filter-types";

export interface GraphView {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CurrentGraph extends GraphView {
  /** Original sources allowed before type projection; excludes display-only representatives. */
  sourceIds: ReadonlySet<string>;
  /** Source-to-display mapping, plus selectable document representatives. */
  representatives: Map<string, string>;
  /** Visible identities; hidden source blocks cannot remain chosen. */
  eligibleIds: Set<string>;
  excludedIds: Set<string>;
}

export function nodeType(node: GraphNode): string {
  return node.entity && node.entity !== "block" ? node.entity : (node.blockType ?? "d");
}

export function isBlock(node: GraphNode): boolean {
  return !node.entity || node.entity === "block";
}

function sourceParents(data: GraphLike, byIndex: ReadonlyMap<number, GraphNode>) {
  const parents = new Map<string, string>();
  for (const node of data.nodes) {
    if (isBlock(node) && node.parentId && node.parentId !== node.id)
      parents.set(node.id, node.parentId);
  }
  for (const edge of data.edges) {
    if (edge.kind !== "hierarchy") continue;
    const source = byIndex.get(edge.source);
    const target = byIndex.get(edge.target);
    if (source && target && source.id !== target.id && !parents.has(target.id))
      parents.set(target.id, source.id);
  }
  for (const node of data.nodes) {
    if (isBlock(node) && !parents.has(node.id) && node.rootId && node.rootId !== node.id)
      parents.set(node.id, node.rootId);
  }
  return parents;
}

interface ContainmentIndex {
  byId: ReadonlyMap<string, GraphNode>;
  parents: Map<string, string>;
  children: Map<string, string[]>;
}

const containmentCache = new WeakMap<
  readonly GraphNode[],
  WeakMap<readonly GraphEdge[], ContainmentIndex>
>();

function containmentIndex(data: GraphLike): ContainmentIndex {
  let byEdges = containmentCache.get(data.nodes);
  if (!byEdges) {
    byEdges = new WeakMap();
    containmentCache.set(data.nodes, byEdges);
  }
  const cached = byEdges.get(data.edges);
  if (cached) return cached;
  const { byId, byIndex } = getGraphLookups(data);
  const parents = sourceParents(data, byIndex);
  const children = new Map<string, string[]>();
  for (const [child, parent] of parents) {
    const siblings = children.get(parent) ?? [];
    siblings.push(child);
    children.set(parent, siblings);
  }
  const result = { byId, parents, children };
  byEdges.set(data.edges, result);
  return result;
}

function expandContainment(
  { byId, children }: ContainmentIndex,
  rootIds: readonly string[],
  includeChildDocuments: boolean,
): Set<string> {
  const found = new Set<string>();
  const queue: string[] = [];
  for (const rootId of rootIds) {
    const root = byId.get(rootId);
    if (!root || !isBlock(root) || found.has(rootId)) continue;
    found.add(rootId);
    queue.push(rootId);
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const child of children.get(queue[cursor]) ?? []) {
      if (found.has(child)) continue;
      const node = byId.get(child);
      if (!node || (!includeChildDocuments && nodeType(node) === "d")) continue;
      found.add(child);
      queue.push(child);
    }
  }
  return found;
}

/** Containment is independent of whether virtual containment edges are enabled. */
export function containedIds(
  data: GraphLike,
  rootId: string,
  includeChildDocuments = true,
): Set<string> {
  return expandContainment(containmentIndex(data), [rootId], includeChildDocuments);
}

/** Add the native parent chain of each search hit, including document-tree
 * parents up to the top-level document. Shared ancestors are visited once;
 * siblings, descendants and logical database entities are never expanded. */
export function searchAncestorIds(data: GraphLike, matchedIds: ReadonlySet<string>): Set<string> {
  const result = new Set<string>();
  if (!matchedIds.size) return result;
  const { byId, parents } = containmentIndex(data);
  for (let id of matchedIds) {
    while (!result.has(id)) {
      // Keep unavailable original hits so their existing diagnostic remains
      // meaningful; missing parents are not invented as placeholder nodes.
      result.add(id);
      const node = byId.get(id);
      const parentId = parents.get(id);
      const parent = parentId ? byId.get(parentId) : undefined;
      if (
        !node ||
        !isBlock(node) ||
        !parent ||
        !isBlock(parent) ||
        node.notebook !== parent.notebook
      )
        break;
      id = parent.id;
    }
  }
  return result;
}

function provenanceOf(edge: GraphEdge, byIndex: ReadonlyMap<number, GraphNode>): GraphProvenance[] {
  if (edge.provenance?.length) return edge.provenance;
  const source = byIndex.get(edge.source);
  const target = byIndex.get(edge.target);
  return source && target
    ? [
        {
          sourceId: source.id,
          targetId: target.id,
          kind: edge.kind,
          weight: edge.weight,
        },
      ]
    : [];
}

/**
 * Bound source facts before replacing hidden endpoints. A document added only
 * to represent an in-scope hidden block does not import its outside source edges.
 */
export function projectGraph(
  data: GraphDataset,
  filters: GraphFilters,
  searchIds?: ReadonlySet<string>,
): CurrentGraph {
  const { byId, byIndex } = getGraphLookups(data);
  const containment =
    filters.scopeId || filters.hierarchy || filters.excludeIds.length
      ? containmentIndex(data)
      : null;
  const scopeIds = filters.scopeId
    ? expandContainment(containment!, [filters.scopeId], filters.includeChildDocuments)
    : null;
  // All roots share one index and traversal. Overlapping exclusions visit each
  // contained identity once instead of rebuilding the graph for every root.
  const excludedIds = containment
    ? expandContainment(containment, filters.excludeIds, true)
    : new Set<string>();
  const candidates = new Set<string>();
  for (const node of data.nodes) {
    if (searchIds && !searchIds.has(node.id)) continue;
    if (excludedIds.has(node.id) || (scopeIds && !scopeIds.has(node.id))) continue;
    if (isBlock(node)) {
      if (!filters.notebook || node.notebook === filters.notebook) candidates.add(node.id);
    } else if (filters.databases) {
      const bound = node.boundBlockId ? byId.get(node.boundBlockId) : undefined;
      if (
        node.boundBlockId &&
        (excludedIds.has(node.boundBlockId) ||
          (filters.notebook && bound?.notebook !== filters.notebook))
      )
        continue;
      candidates.add(node.id);
    }
  }

  // Non-block mediators enter a notebook/content-filtered graph through actual
  // database connections, never through a fabricated owning document.
  if (filters.notebook || excludedIds.size) {
    const links = new Map<string, string[]>();
    for (const edge of data.edges) {
      if (!edge.kind.startsWith("database-")) continue;
      const from = byIndex.get(edge.source)?.id;
      const to = byIndex.get(edge.target)?.id;
      if (!from || !to || !candidates.has(from) || !candidates.has(to)) continue;
      const outgoing = links.get(from) ?? [];
      outgoing.push(to);
      links.set(from, outgoing);
      const incoming = links.get(to) ?? [];
      incoming.push(from);
      links.set(to, incoming);
    }
    const reached = new Set(
      data.nodes.filter((node) => isBlock(node) && candidates.has(node.id)).map((node) => node.id),
    );
    const queue = [...reached];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      for (const next of links.get(queue[cursor]) ?? []) {
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    for (const node of data.nodes)
      if (!isBlock(node) && !reached.has(node.id)) candidates.delete(node.id);
  }

  const eligibleIds = new Set<string>();
  for (const node of data.nodes) {
    if (!candidates.has(node.id)) continue;
    if (!isTypeHidden(filters, nodeType(node))) eligibleIds.add(node.id);
    else if (isBlock(node) && node.rootId) {
      const document = byId.get(node.rootId);
      if (
        document &&
        nodeType(document) === "d" &&
        !excludedIds.has(document.id) &&
        (!filters.notebook || document.notebook === filters.notebook)
      )
        eligibleIds.add(document.id);
    }
  }
  const visible = data.nodes.filter((node) => eligibleIds.has(node.id));
  const representatives = new Map(visible.map((node) => [node.id, node.id]));
  for (const node of data.nodes) {
    if (
      candidates.has(node.id) &&
      !eligibleIds.has(node.id) &&
      isBlock(node) &&
      node.rootId &&
      eligibleIds.has(node.rootId)
    )
      representatives.set(node.id, node.rootId);
  }
  const grouped = new Map<string, GraphEdge>();
  const add = (
    source: GraphNode,
    target: GraphNode,
    edge: GraphEdge,
    provenance: GraphProvenance[],
  ) => {
    const key = JSON.stringify([edge.kind, source.index, target.index]);
    const previous = grouped.get(key);
    if (previous) {
      previous.weight += edge.weight;
      previous.provenance!.push(...provenance);
    } else {
      grouped.set(key, {
        source: source.index,
        target: target.index,
        kind: edge.kind,
        weight: edge.weight,
        provenance: [...provenance],
      });
    }
  };
  for (const edge of data.edges) {
    if (edge.kind === "hierarchy") continue;
    // Derived candidates are attached after native eligibility and projection.
    if (edge.kind === "text-mention") continue;
    if (edge.kind === "reference" ? !filters.references : !filters.databases) continue;
    const originalSource = byIndex.get(edge.source);
    const originalTarget = byIndex.get(edge.target);
    if (
      !originalSource ||
      !originalTarget ||
      !candidates.has(originalSource.id) ||
      !candidates.has(originalTarget.id)
    )
      continue;
    const from = representatives.get(originalSource.id);
    const to = representatives.get(originalTarget.id);
    const source = from ? byId.get(from) : undefined;
    const target = to ? byId.get(to) : undefined;
    if (source && target) add(source, target, edge, provenanceOf(edge, byIndex));
  }
  if (filters.hierarchy) {
    const parents = containment!.parents;
    for (const node of visible) {
      if (!isBlock(node) || !candidates.has(node.id)) continue;
      let ancestor = parents.get(node.id);
      const visited = new Set([node.id]);
      const viaIds: string[] = [];
      while (ancestor && !visited.has(ancestor)) {
        visited.add(ancestor);
        const parent = byId.get(ancestor);
        // Search results can omit structural containers between two hits.
        // Trace those parents as evidence without admitting their source facts;
        // explicit scope, notebook and exclusion boundaries still stop the walk.
        if (
          !parent ||
          !isBlock(parent) ||
          excludedIds.has(ancestor) ||
          (scopeIds && !scopeIds.has(ancestor)) ||
          (filters.notebook && parent.notebook !== filters.notebook)
        )
          break;
        if (candidates.has(ancestor) && eligibleIds.has(ancestor)) {
          const provenance: GraphProvenance = {
            sourceId: ancestor,
            targetId: node.id,
            kind: "hierarchy",
            weight: 1,
            ...(viaIds.length ? { viaIds: [...viaIds].reverse() } : {}),
          };
          add(
            parent,
            node,
            {
              source: parent.index,
              target: node.index,
              kind: "hierarchy",
              weight: 1,
            },
            [provenance],
          );
          break;
        }
        viaIds.push(ancestor);
        ancestor = parents.get(ancestor);
      }
    }
  }
  const edges = [...grouped.values()];
  const degrees = new Map<number, number>();
  for (const edge of edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  return {
    nodes: visible.map((node) => ({
      ...node,
      degree: degrees.get(node.index) ?? 0,
    })),
    edges,
    representatives,
    eligibleIds,
    excludedIds,
    sourceIds: candidates,
  };
}

const openTargetCache = new WeakMap<
  CurrentGraph,
  {
    data: GraphDataset;
    targets: Map<string, string>;
  }
>();

function currentOpenTargets(data: GraphDataset, graph: CurrentGraph): Map<string, string> {
  const cached = openTargetCache.get(graph);
  if (cached?.data === data) return cached.targets;
  const targets = new Map<string, string>();
  const nativeSources = new Set<string>();
  const { byIndex } = getGraphLookups(data);
  for (const node of data.nodes) {
    // Type-hidden source blocks remain available through their document
    // representative. Notebook and content exclusions have no representative.
    if (isBlock(node) && graph.representatives.has(node.id) && !graph.excludedIds.has(node.id)) {
      targets.set(node.id, node.id);
      nativeSources.add(node.id);
    }
  }
  const embeddings = new Map<string, string>();
  for (const edge of data.edges) {
    if (edge.kind !== "database-embedding") continue;
    const carrier = byIndex.get(edge.source);
    const database = byIndex.get(edge.target);
    if (
      !carrier ||
      !database ||
      !isBlock(carrier) ||
      nodeType(carrier) !== "av" ||
      database.entity !== "database" ||
      !database.databaseId ||
      !targets.has(carrier.id)
    )
      continue;
    if (!embeddings.has(database.databaseId)) embeddings.set(database.databaseId, carrier.id);
  }
  for (const node of data.nodes) {
    if (isBlock(node) || !graph.representatives.has(node.id) || graph.excludedIds.has(node.id))
      continue;
    const bound =
      node.boundBlockId && nativeSources.has(node.boundBlockId) ? node.boundBlockId : undefined;
    const carrier = node.databaseId ? embeddings.get(node.databaseId) : undefined;
    if (bound || carrier) targets.set(node.id, bound ?? carrier!);
  }
  // Source datasets and their projections are immutable after publication.
  // Inspector cards reuse this index; obsolete graph revisions are collectible.
  openTargetCache.set(graph, { data, targets });
  return targets;
}

/** Resolve a native source context that still meets this graph's source filters. */
export function resolveOpenBlock(
  id: string,
  data: GraphDataset,
  currentGraph: CurrentGraph,
): string | null {
  return currentOpenTargets(data, currentGraph).get(id) ?? null;
}

export function scopeBackground(
  data: GraphDataset,
  graph: CurrentGraph,
  scopeId: string,
  includeChildDocuments: boolean,
): Set<string> {
  if (!scopeId) return new Set(graph.nodes.map((node) => node.id));
  const result = new Set<string>();
  for (const id of containedIds(data, scopeId, includeChildDocuments)) {
    const representative = graph.representatives.get(id);
    if (representative) result.add(representative);
  }
  return result;
}

/** B is the display boundary; separately computed N hops only affect highlighting. */
export function scopeGraph(
  graph: CurrentGraph,
  backgroundIds: ReadonlySet<string>,
  chosenIds: ReadonlySet<string>,
  reachedIndices: ReadonlySet<number> | null,
  hideIsolated: boolean,
): GraphView {
  return createViewProjector(graph).project(backgroundIds, chosenIds, reachedIndices, hideIsolated);
}

export interface GraphViewProjector {
  project(
    backgroundIds: ReadonlySet<string>,
    chosenIds: ReadonlySet<string>,
    reachedIndices: ReadonlySet<number> | null,
    hideIsolated: boolean,
  ): GraphView;
}

function sameSequence<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left === right ||
    (left.length === right.length && left.every((value, index) => value === right[index]))
  );
}

/** Own one projector per immutable Q revision, never across changed source facts. */
export function createViewProjector(graph: CurrentGraph): GraphViewProjector {
  let candidates = graph.nodes;
  let edges = graph.edges;
  let connected: Set<number> | undefined;
  let previous: GraphView | undefined;
  return {
    project(backgroundIds, chosenIds, _reachedIndices, hideIsolated) {
      // scopeBackground always returns B as a subset of this Q revision.
      const fullBackground = backgroundIds.size === graph.nodes.length;
      const nextCandidates = fullBackground
        ? graph.nodes
        : graph.nodes.filter((node) => backgroundIds.has(node.id));
      if (!sameSequence(nextCandidates, candidates)) {
        candidates = nextCandidates;
        if (candidates.length === graph.nodes.length) edges = graph.edges;
        else {
          const included = new Set(candidates.map((node) => node.index));
          edges = graph.edges.filter(
            (edge) => included.has(edge.source) && included.has(edge.target),
          );
        }
        connected = undefined;
      }
      let nodes = candidates;
      if (hideIsolated) {
        if (!connected) {
          connected = new Set<number>();
          for (const edge of edges) {
            connected.add(edge.source);
            connected.add(edge.target);
          }
        }
        nodes = candidates.filter((node) => connected!.has(node.index) || chosenIds.has(node.id));
      }
      const sameNodes = previous !== undefined && sameSequence(previous.nodes, nodes);
      const sameEdges = previous !== undefined && sameSequence(previous.edges, edges);
      if (sameNodes && sameEdges) return previous!;
      previous = {
        nodes: sameNodes ? previous!.nodes : nodes,
        edges: sameEdges ? previous!.edges : edges,
      };
      return previous;
    },
  };
}

/** Engine indices describe this projection only, independent of source indices. */
export function numericTopology(graph: GraphView) {
  const sourceToDense = new Map(graph.nodes.map((node, dense) => [node.index, dense]));
  const endpoints = new Uint32Array(graph.edges.length * 2);
  graph.edges.forEach((edge, index) => {
    const source = sourceToDense.get(edge.source);
    const target = sourceToDense.get(edge.target);
    if (source === undefined || target === undefined) throw new Error("当前图包含不可用的关系端点");
    endpoints[index * 2] = source;
    endpoints[index * 2 + 1] = target;
  });
  return {
    endpoints,
    denseToSource: graph.nodes.map((node) => node.index),
    idToDense: new Map(graph.nodes.map((node, index) => [node.id, index])),
  };
}
