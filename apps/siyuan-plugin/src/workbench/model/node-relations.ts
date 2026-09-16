import type { GraphEdge } from "../../core/graph/types";

/** Count displayed relationships once, including projected self references. */
export function groupNodeRelations(index: number, edges: readonly GraphEdge[]) {
  const outgoing: GraphEdge[] = [];
  const incoming: GraphEdge[] = [];
  const self: GraphEdge[] = [];
  for (const edge of edges) {
    if (edge.source === index && edge.target === index) self.push(edge);
    else if (edge.source === index) outgoing.push(edge);
    else if (edge.target === index) incoming.push(edge);
  }
  return { outgoing, incoming, self };
}
