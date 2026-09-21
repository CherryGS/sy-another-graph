import type { GraphLike } from "../../core/graph/graph-lookups";

/** A deterministic 0/1 minimum spanning forest, pruned of empty document leaves.
 * Only decides node membership; callers keep every surviving original edge. */
export function removableEmptyDocuments(
  graph: GraphLike,
  candidates: ReadonlySet<string>,
  required: ReadonlySet<string> = new Set(),
): Set<string> {
  const nodes = [...graph.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const positions = new Map(nodes.map((node, index) => [node.index, index]));
  const parent = Uint32Array.from(nodes, (_, index) => index),
    size = new Uint32Array(nodes.length).fill(1);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const links = graph.edges
    .flatMap((edge) => {
      const from = positions.get(edge.source),
        to = positions.get(edge.target);
      return from === undefined || to === undefined || from === to
        ? []
        : [[Math.min(from, to), Math.max(from, to)] as const];
    })
    .sort(([a, b], [c, d]) => a - c || b - d);
  const forest: number[][] = Array.from(nodes, () => []);
  // Stable ID order breaks ties, independently of source array/index order.
  for (const cost of [0, 1])
    for (const [from, to] of links) {
      if (Number(candidates.has(nodes[from].id) || candidates.has(nodes[to].id)) !== cost) continue;
      let a = find(from),
        b = find(to);
      if (a === b) continue;
      if (size[a] < size[b]) [a, b] = [b, a];
      parent[b] = a;
      size[a] += size[b];
      forest[from].push(to);
      forest[to].push(from);
    }
  const degree = Uint32Array.from(forest, (neighbors) => neighbors.length);
  const queue = nodes.flatMap((node, index) =>
    candidates.has(node.id) && !required.has(node.id) && degree[index] <= 1 ? [index] : [],
  );
  const removed = new Set<string>();
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor],
      id = nodes[index].id;
    if (removed.has(id)) continue;
    removed.add(id);
    for (const neighbor of forest[index]) {
      if (removed.has(nodes[neighbor].id)) continue;
      degree[neighbor]--;
      if (
        degree[neighbor] <= 1 &&
        candidates.has(nodes[neighbor].id) &&
        !required.has(nodes[neighbor].id)
      )
        queue.push(neighbor);
    }
  }
  return removed;
}
