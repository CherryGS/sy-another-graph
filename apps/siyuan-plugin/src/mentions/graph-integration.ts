import { getGraphLookups } from "../data/graph-lookups";
import { isBlock, type CurrentGraph } from "../data/graph-model";
import type { GraphDataset, GraphEdge } from "../data/types";
import type { MentionScope } from "./types";

/** Only actual eligible sources enter matching; display-only document
 * representatives never import their outside body or names into the scope. */
export function mentionScope(data: GraphDataset, graph: CurrentGraph): MentionScope {
  const sources = getGraphLookups(data).byId;
  const visible = getGraphLookups(graph).byId;
  const entries: MentionScope["entries"] = [];
  for (const id of graph.sourceIds) {
    const source = sources.get(id);
    const representative = graph.representatives.get(id);
    const node = representative ? visible.get(representative) : undefined;
    if (source && isBlock(source) && node)
      entries.push({ id, displayId: node.id, index: node.index });
  }
  return {
    entries,
    explicitPairs: graph.edges
      .filter((edge) => edge.kind === "reference")
      .map((edge) => [edge.source, edge.target]),
  };
}

/** Attach derived edges after scope/projection, without changing eligible nodes. */
export function withMentionEdges(base: CurrentGraph, mentions: readonly GraphEdge[]): CurrentGraph {
  if (!mentions.length) return base;
  const nodes = getGraphLookups(base).byIndex;
  const valid = mentions.filter(
    (edge) =>
      edge.kind === "text-mention" &&
      nodes.has(edge.source) &&
      nodes.has(edge.target) &&
      !!edge.provenance?.length &&
      edge.provenance.every(
        (item) => base.sourceIds.has(item.sourceId) && base.sourceIds.has(item.targetId),
      ),
  );
  if (!valid.length) return base;
  const extra = new Map<number, number>();
  for (const edge of valid) {
    extra.set(edge.source, (extra.get(edge.source) ?? 0) + 1);
    extra.set(edge.target, (extra.get(edge.target) ?? 0) + 1);
  }
  return {
    ...base,
    nodes: base.nodes.map((node) => ({
      ...node,
      degree: node.degree + (extra.get(node.index) ?? 0),
    })),
    edges: [...base.edges, ...valid],
  };
}
