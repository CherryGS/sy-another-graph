import { useMemo } from "react";
import { nodeType } from "../data/graph-model";
import { NODE_TYPE_LABELS } from "../data/labels";
import { NODE_TYPE_COLORS, nodeTypeColor, type GraphColorMode } from "./node-colors";
import type { CanvasNode } from "./types";

export function GraphLegend({ nodes, colorBy }: { nodes: readonly CanvasNode[]; colorBy: GraphColorMode }) {
  const types = useMemo(() => {
    if (colorBy !== "type") return [];
    const counts = new Map<string, number>();
    for (const node of nodes) {
      const type = nodeType(node);
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    const order = Object.keys(NODE_TYPE_COLORS);
    return [...counts].sort(([left], [right]) => {
      const leftIndex = order.indexOf(left);
      const rightIndex = order.indexOf(right);
      return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex) || left.localeCompare(right);
    });
  }, [nodes, colorBy]);
  const external = useMemo(() => nodes.filter((node) => node.external).length, [nodes]);
  if (!types.length && !external) return null;
  return (
    <div className="ag-canvas__legend" aria-label="图谱颜色图例">
      {types.map(([type, count]) => (
        <span key={type}>
          <i style={{ background: nodeTypeColor(type) }} />
          {Object.hasOwn(NODE_TYPE_LABELS, type) ? NODE_TYPE_LABELS[type] : type} · {count.toLocaleString()}
        </span>
      ))}
      {external > 0 && (
        <span className={colorBy === "type" ? "ag-canvas__external-count" : "ag-canvas__external-key"}>
          ↗ 范围外补充 · {external.toLocaleString()}
        </span>
      )}
    </div>
  );
}
