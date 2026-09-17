import { message as msg, MessageError } from "../../core/diagnostics/message";
import type { CosmographConfig } from "@cosmograph/cosmograph";
import type { CanvasEdge, CanvasNode } from "../../workbench/presentation/types";
import { nodeColor } from "../../workbench/presentation/node-colors";
import { SEARCH_MATCH_RING_COLOR } from "../../workbench/presentation/search-origins";
import { searchNodeOrigin, type SearchOrigins } from "../../modules/search/origins";
import { EDGE_KINDS, type GraphEncoder, type GraphIPC } from "./preparation-protocol";

const CHUNK_SIZE = 8192;

async function yieldToBrowser(signal: AbortSignal) {
  signal.throwIfAborted();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  signal.throwIfAborted();
}

export interface PreparedGraph {
  config: CosmographConfig;
  ipc: GraphIPC;
  indexToId: string[];
  indexToLabel: string[];
  indexToNode: readonly CanvasNode[];
  indexToEdge: readonly CanvasEdge[];
  idToIndex: Map<string, number>;
  pointsCount: number;
  linksCount: number;
  preparationMs: number;
  searchOrigins?: SearchOrigins;
}

/** Keep the source graph's stable indices at the boundary, then densely index the visible graph. */
export async function prepareGraph(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  signal: AbortSignal,
  encode: GraphEncoder,
  searchOrigins?: SearchOrigins,
): Promise<PreparedGraph> {
  const started = performance.now();
  signal.throwIfAborted();
  const id = new Array<string>(nodes.length);
  const indexToLabel = new Array<string>(nodes.length);
  const notebook = new Array<string>(nodes.length);
  const color = new Array<string>(nodes.length);
  const branchColor = new Array<string>(nodes.length);
  const degreeColor = new Array<string>(nodes.length);
  const typeColor = new Array<string>(nodes.length);
  const degree = new Float32Array(nodes.length);
  const accentedPointIndices: number[] = [];
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
      if (!node.id || idToIndex.has(node.id) || originalToDense.has(node.index)) {
        throw new MessageError(msg("text.theGraphContainsEmptyOrDuplicateNodeIds"));
      }
      if (!Number.isSafeInteger(node.index) || node.index < 0) {
        throw new MessageError(msg("text.theGraphContainsInvalidNodeIndices"));
      }
      id[position] = node.id;
      indexToLabel[position] = node.label || node.id;
      const origin = searchNodeOrigin(node.id, searchOrigins);
      if (origin === "match" || origin === "projected-match") accentedPointIndices.push(position);
      notebook[position] = node.notebook;
      color[position] = nodeColor(node, "notebook");
      branchColor[position] = nodeColor(node, "branch");
      degreeColor[position] = nodeColor(node, "degree");
      typeColor[position] = nodeColor(node, "type");
      degree[position] = Number.isFinite(node.degree) ? Math.max(0, node.degree) : 0;
      originalToDense.set(node.index, position);
      idToIndex.set(node.id, position);
    }
  }

  const sourceIndex = new Uint32Array(edges.length);
  const targetIndex = new Uint32Array(edges.length);
  const colorIndex = new Uint8Array(edges.length);
  const weight = new Float32Array(edges.length);
  const width = new Float32Array(edges.length);
  const style = new Uint8Array(edges.length);
  const indexToEdge: CanvasEdge[] = [];
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
      sourceIndex[linkCount] = from;
      targetIndex[linkCount] = to;
      const reference = edge.kind === "reference";
      const hierarchy = edge.kind === "hierarchy";
      colorIndex[linkCount] = EDGE_KINDS.indexOf(edge.kind);
      weight[linkCount] = Number.isFinite(edge.weight) ? Math.max(1, edge.weight) : 1;
      const emphasis = Math.min(1, Math.log2(weight[linkCount]) / 4);
      width[linkCount] = reference ? 1.55 + emphasis * 0.8 : 0.95 + emphasis * 0.35;
      style[linkCount] = edge.kind === "text-mention" ? 2 : hierarchy ? 1 : 0;
      // Preserve the exact source edge, including self-loops and original provenance.
      indexToEdge.push(edge);
      linkCount++;
    }
  }

  signal.throwIfAborted();
  const ipc = await encode(
    {
      points: {
        id,
        label: indexToLabel,
        notebook,
        color,
        branchColor,
        degreeColor,
        typeColor,
        degree,
        accentedIndices: Uint32Array.from(accentedPointIndices),
      },
      links: {
        sourceIndex: sourceIndex.subarray(0, linkCount),
        targetIndex: targetIndex.subarray(0, linkCount),
        colorIndex: colorIndex.subarray(0, linkCount),
        weight: weight.subarray(0, linkCount),
        width: width.subarray(0, linkCount),
        style: style.subarray(0, linkCount),
      },
    },
    signal,
  );
  signal.throwIfAborted();
  return {
    ipc,
    config: {
      pointIdBy: "id",
      pointIndexBy: "index",
      pointLabelBy: "label",
      pointLabelWeightBy: "labelWeight",
      accentedPointIndices,
      accentedPointRingColor: SEARCH_MATCH_RING_COLOR,
      pointColorBy: "typeColor",
      pointColorStrategy: "direct",
      pointSizeBy: "degree",
      pointSizeStrategy: "auto",
      pointIncludeColumns: ["notebook", "color", "branchColor", "degreeColor", "typeColor"],
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
    // Render inputs are immutable. Keep their identity so consumers can reject
    // a prepared result that belongs to an earlier graph, without comparing IDs.
    indexToNode: nodes,
    indexToEdge,
    idToIndex,
    pointsCount: nodes.length,
    linksCount: linkCount,
    preparationMs: performance.now() - started,
    searchOrigins,
  };
}
