import { Table, tableFromArrays, vectorFromArray, Utf8 } from "apache-arrow";
import type { CosmographConfig } from "@cosmograph/cosmograph";
import type { CanvasEdge, CanvasNode } from "./types";
import { nodeColor } from "./node-colors";

const CHUNK_SIZE = 8192;
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

async function yieldToBrowser(signal: AbortSignal) {
  signal.throwIfAborted();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  signal.throwIfAborted();
}

export interface PreparedGraph {
  config: CosmographConfig;
  indexToId: string[];
  indexToLabel: string[];
  idToIndex: Map<string, number>;
  pointsCount: number;
  linksCount: number;
  preparationMs: number;
}

/** Keep the source graph's stable indices at the boundary, then densely index the visible graph. */
export async function prepareGraph(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  signal: AbortSignal,
): Promise<PreparedGraph> {
  const started = performance.now();
  signal.throwIfAborted();
  const id = new Array<string>(nodes.length);
  const label = new Array<string>(nodes.length);
  const indexToLabel = new Array<string>(nodes.length);
  const notebook = new Array<string>(nodes.length);
  const color = new Array<string>(nodes.length);
  const branchColor = new Array<string>(nodes.length);
  const degreeColor = new Array<string>(nodes.length);
  const index = new Uint32Array(nodes.length);
  const degree = new Float32Array(nodes.length);
  const originalToDense = new Map<number, number>();
  const idToIndex = new Map<string, number>();

  for (let offset = 0; offset < nodes.length; offset += CHUNK_SIZE) {
    await yieldToBrowser(signal);
    for (
      let position = offset;
      position < Math.min(offset + CHUNK_SIZE, nodes.length);
      position++
    ) {
      const node = nodes[position];
      if (
        !node.id ||
        idToIndex.has(node.id) ||
        originalToDense.has(node.index)
      ) {
        throw new Error("图谱包含空白或重复的节点标识。");
      }
      if (!Number.isSafeInteger(node.index) || node.index < 0) {
        throw new Error("图谱包含无效的节点索引。");
      }
      id[position] = node.id;
      // Cosmograph renders sanitized HTML for both regular and hovered labels.
      // Preserve note titles as literal text; even a sanitized <img> can make a network request.
      indexToLabel[position] = node.label || node.id;
      label[position] = indexToLabel[position].replace(
        /[&<>"']/g,
        (character) => HTML_ENTITIES[character],
      );
      notebook[position] = node.notebook;
      color[position] = node.color;
      branchColor[position] = nodeColor(node, "branch");
      degreeColor[position] = nodeColor(node, "degree");
      index[position] = position;
      degree[position] = Number.isFinite(node.degree)
        ? Math.max(0, node.degree)
        : 0;
      originalToDense.set(node.index, position);
      idToIndex.set(node.id, position);
    }
  }

  const source: string[] = [];
  const target: string[] = [];
  const sourceIndex = new Uint32Array(edges.length);
  const targetIndex = new Uint32Array(edges.length);
  const linkColor: string[] = [];
  const weight = new Float32Array(edges.length);
  const width = new Float32Array(edges.length);
  const style = new Uint8Array(edges.length);
  let linkCount = 0;
  for (let offset = 0; offset < edges.length; offset += CHUNK_SIZE) {
    await yieldToBrowser(signal);
    for (
      let position = offset;
      position < Math.min(offset + CHUNK_SIZE, edges.length);
      position++
    ) {
      const edge = edges[position];
      const from = originalToDense.get(edge.source);
      const to = originalToDense.get(edge.target);
      // The caller may filter nodes without rebuilding the original graph's edge list.
      if (from === undefined || to === undefined) continue;
      source.push(id[from]);
      target.push(id[to]);
      sourceIndex[linkCount] = from;
      targetIndex[linkCount] = to;
      const reference = edge.kind === "reference";
      linkColor.push(reference ? "#91b7df" : "#60728d");
      weight[linkCount] = Number.isFinite(edge.weight)
        ? Math.max(1, edge.weight)
        : 1;
      const emphasis = Math.min(1, Math.log2(weight[linkCount]) / 4);
      width[linkCount] = reference
        ? 1.55 + emphasis * 0.8
        : 0.95 + emphasis * 0.35;
      style[linkCount] = reference ? 0 : 1;
      linkCount++;
    }
  }

  signal.throwIfAborted();
  const points = tableFromArrays({
    id,
    label,
    notebook,
    color,
    branchColor,
    degreeColor,
    index,
    degree,
  });
  // Keep a typed source even with no edges: Cosmograph's zero-link transition still queries it.
  const links = new Table({
    source: vectorFromArray(source, new Utf8()),
    target: vectorFromArray(target, new Utf8()),
    sourceIndex: vectorFromArray(sourceIndex.subarray(0, linkCount)),
    targetIndex: vectorFromArray(targetIndex.subarray(0, linkCount)),
    color: vectorFromArray(linkColor, new Utf8()),
    weight: vectorFromArray(weight.subarray(0, linkCount)),
    width: vectorFromArray(width.subarray(0, linkCount)),
    style: vectorFromArray(style.subarray(0, linkCount)),
  });
  return {
    config: {
      points,
      links,
      pointIdBy: "id",
      pointIndexBy: "index",
      pointLabelBy: "label",
      pointLabelWeightBy: "degree",
      pointColorBy: "branchColor",
      pointColorStrategy: "direct",
      pointSizeBy: "degree",
      pointSizeStrategy: "auto",
      pointIncludeColumns: ["notebook", "color", "branchColor", "degreeColor"],
      linkSourceBy: "source",
      linkTargetBy: "target",
      linkSourceIndexBy: "sourceIndex",
      linkTargetIndexBy: "targetIndex",
      linkColorBy: "color",
      linkColorStrategy: "direct",
      linkWidthBy: "width",
      linkWidthStrategy: "direct",
      // A width accessor prevents per-view rescaling from making single-weight arrows tiny.
      linkWidthByFn: (value: number) => value,
      linkStyleBy: "style",
    },
    indexToId: id,
    indexToLabel,
    idToIndex,
    pointsCount: nodes.length,
    linksCount: linkCount,
    preparationMs: performance.now() - started,
  };
}
