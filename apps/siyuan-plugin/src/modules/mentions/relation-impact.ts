import type { GraphEdge } from "../../core/graph/types";

/** Counts displayed directed relations, not occurrences or keyword matches. */
export function mentionRelationImpact(before: readonly GraphEdge[], after: readonly GraphEdge[]) {
  const key = (edge: GraphEdge) => `${edge.source}:${edge.target}`;
  const previous = new Map(before.map((edge) => [key(edge), edge]));
  const current = new Map(after.map((edge) => [key(edge), edge]));
  return {
    removed: [...previous].filter(([id]) => !current.has(id)).map(([, edge]) => edge),
    added: [...current].filter(([id]) => !previous.has(id)).map(([, edge]) => edge),
  };
}
