import type { GraphLike } from "./graph-lookups";

const cache = new WeakMap<object, ReadonlyMap<number, number>>();

/** Degree belongs to this immutable graph, not to the source node's identity. */
export function graphDegrees(graph: GraphLike): ReadonlyMap<number, number> {
  const previous = cache.get(graph);
  if (previous) return previous;
  const degrees = new Map<number, number>();
  for (const edge of graph.edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  cache.set(graph, degrees);
  return degrees;
}
