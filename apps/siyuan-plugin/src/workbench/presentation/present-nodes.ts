import type { GraphNode, Notebook } from "../../core/graph/types";
import type { GraphLike } from "../../core/graph/graph-lookups";
import { graphDegrees } from "../../core/graph/metrics";
import { PALETTE } from "./palette";

export interface CanvasNode extends GraphNode {
  degree: number;
  /** Notebook/logical-entity accent; the selected color mode is applied later. */
  color: string;
}

const notebookColors = new WeakMap<readonly Notebook[], ReadonlyMap<string, string>>();
function colorsFor(notebooks: readonly Notebook[]): ReadonlyMap<string, string> {
  let colors = notebookColors.get(notebooks);
  if (!colors) {
    colors = new Map(notebooks.map((book, index) => [book.id, PALETTE[index % PALETTE.length]]));
    notebookColors.set(notebooks, colors);
  }
  return colors;
}

function styleNode(
  node: GraphNode,
  degree: number,
  colors: ReadonlyMap<string, string>,
): CanvasNode {
  return {
    ...node,
    degree,
    color:
      colors.get(node.notebook) ??
      (node.entity === "database" || node.entity === "database-item" ? PALETTE[2] : PALETTE[0]),
  };
}

export function presentNode(
  node: GraphNode,
  graph: GraphLike | null,
  notebooks: readonly Notebook[],
): CanvasNode {
  return styleNode(
    node,
    graph ? (graphDegrees(graph).get(node.index) ?? 0) : 0,
    colorsFor(notebooks),
  );
}

export function presentNodes(graph: GraphLike, notebooks: readonly Notebook[]): CanvasNode[] {
  const degrees = graphDegrees(graph);
  const colors = colorsFor(notebooks);
  return graph.nodes.map((node) => styleNode(node, degrees.get(node.index) ?? 0, colors));
}
