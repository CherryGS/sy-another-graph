import type { GraphLike } from "../../core/graph/graph-lookups";

export const UNREACHABLE = 0xffff_ffff;
export const LAYER_SPACE = 8192;

export interface GraphLayers {
  readonly graph: GraphLike;
  readonly distanceById: ReadonlyMap<string, number>;
  readonly maxDistance: number;
  readonly unreachable: number;
}

/** The engine's dense order is the complete effective graph's node order. */
export function graphLayers(graph: GraphLike, distances: Uint32Array): GraphLayers {
  if (distances.length !== graph.nodes.length)
    throw new Error("Layer distances do not match the current graph");
  const distanceById = new Map<string, number>();
  let maxDistance = 0;
  let unreachable = 0;
  graph.nodes.forEach((node, index) => {
    const distance = distances[index];
    if (distance === UNREACHABLE) unreachable++;
    else if (distance >= graph.nodes.length) throw new Error("Invalid graph layer distance");
    else maxDistance = Math.max(maxDistance, distance);
    distanceById.set(node.id, distance);
  });
  return { graph, distanceById, maxDistance, unreachable };
}

export interface LayerCoordinates {
  readonly positions: Float32Array;
  readonly dimensions: 2 | 3;
}

/** Stable-ID ordering keeps rows independent of selection order and UI language.
 * In 3D each hop occupies a Y/Z plane. Unreachable nodes get a separate area
 * with an extra gap, never a fictional hop. Coordinates use LAYER_SPACE units;
 * the renderer scales them to its actual device-limited simulation extent.
 */
export function layerCoordinates(
  nodes: readonly { id: string }[],
  layers: GraphLayers,
  dimensions: 2 | 3,
): LayerCoordinates {
  const groups = new Map<number, { id: string; index: number }[]>();
  nodes.forEach(({ id }, index) => {
    const distance = layers.distanceById.get(id);
    if (distance === undefined) throw new Error("A displayed node is missing from the layer graph");
    const group = groups.get(distance) ?? [];
    group.push({ id, index });
    groups.set(distance, group);
  });
  const lastColumn = layers.maxDistance + (groups.has(UNREACHABLE) ? 2 : 0);
  let widest = 1;
  for (const [distance, group] of groups)
    widest = Math.max(
      widest,
      dimensions === 3 || distance === UNREACHABLE
        ? Math.ceil(Math.sqrt(group.length))
        : group.length,
    );
  const rowStep = Math.min(40, 6144 / Math.max(1, widest - 1));
  const unreachableCount = groups.get(UNREACHABLE)?.length ?? 0;
  const unreachableColumns =
    dimensions === 2 && unreachableCount
      ? Math.ceil(unreachableCount / Math.ceil(Math.sqrt(unreachableCount)))
      : 1;
  const width = lastColumn * 240 + (unreachableColumns - 1) * rowStep;
  const scaleX = Math.min(1, 6144 / Math.max(1, width));
  const positions = new Float32Array(nodes.length * dimensions);
  for (const [distance, group] of groups) {
    group.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const column = distance === UNREACHABLE ? lastColumn : distance;
    const rows =
      dimensions === 3 || distance === UNREACHABLE
        ? Math.ceil(Math.sqrt(group.length))
        : group.length;
    const columns = Math.ceil(group.length / rows);
    group.forEach(({ index }, slot) => {
      const offsetX =
        dimensions === 2 && distance === UNREACHABLE ? Math.floor(slot / rows) * rowStep : 0;
      positions[index * dimensions] = 4096 + (column * 240 + offsetX - width / 2) * scaleX;
      positions[index * dimensions + 1] = 4096 + ((slot % rows) - (rows - 1) / 2) * rowStep;
      if (dimensions === 3)
        positions[index * dimensions + 2] =
          4096 + (Math.floor(slot / rows) - (columns - 1) / 2) * rowStep;
    });
  }
  return { positions, dimensions };
}
