import type { GraphLike } from "../../core/graph/graph-lookups";
import type { GraphEdge, GraphNode } from "../../core/graph/types";
import { isBlock } from "../../core/scope/filter-types";

/** Keep native containment from the unfiltered source, without titles or note bodies. */
export async function compactSetSource(data: GraphLike, signal: AbortSignal): Promise<GraphLike> {
  const nodes: GraphNode[] = [],
    edges: GraphEdge[] = [];
  for (let offset = 0; offset < data.nodes.length; offset += 8192) {
    signal.throwIfAborted();
    for (const node of data.nodes.slice(offset, offset + 8192)) {
      if (!isBlock(node)) continue;
      nodes.push({
        id: node.id,
        index: node.index,
        blockType: node.blockType,
        parentId: node.parentId,
        rootId: node.rootId,
        label: "",
        notebook: "",
        path: "",
      });
    }
    if (offset + 8192 < data.nodes.length)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  for (let offset = 0; offset < data.edges.length; offset += 16384) {
    signal.throwIfAborted();
    for (const edge of data.edges.slice(offset, offset + 16384))
      if (edge.kind === "hierarchy")
        edges.push({ source: edge.source, target: edge.target, kind: "hierarchy", weight: 1 });
    if (offset + 16384 < data.edges.length)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  signal.throwIfAborted();
  return { nodes, edges };
}
