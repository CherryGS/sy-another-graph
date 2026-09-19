import { describe, expect, it } from "vitest";
import type { GraphLike } from "../../core/graph/graph-lookups";
import { graphLayers, layerCoordinates, UNREACHABLE } from "./layers";

const graph = {
  nodes: ["b", "a", "next", "far", "isolated"].map((id, index) => ({ id, index: index * 3 })),
  edges: [],
} as unknown as GraphLike;

describe("layered layout", () => {
  it("keeps exact effective distances independent of sparse source indices and visible subsets", () => {
    const layers = graphLayers(graph, new Uint32Array([0, 0, 1, 2, UNREACHABLE]));
    expect(layers).toMatchObject({ graph, maxDistance: 2, unreachable: 1 });
    const shown = [graph.nodes[3], graph.nodes[1], graph.nodes[4]];
    const { positions } = layerCoordinates(shown, layers, 2);
    expect(positions[0] - positions[2]).toBe(480);
    expect(positions[4] - positions[0]).toBe(480);
    expect(layers.distanceById.get("next")).toBe(1);
  });
  it.each([2, 3] as const)(
    "preserves IDs and equal roots in %dD, without depending on input order",
    (dimensions) => {
      const layers = graphLayers(graph, new Uint32Array([0, 0, 1, 2, UNREACHABLE]));
      const { positions } = layerCoordinates(graph.nodes, layers, dimensions);
      const reversed = layerCoordinates([...graph.nodes].reverse(), layers, dimensions).positions;
      expect(positions[0]).toBe(positions[dimensions]);
      expect(positions[1]).toBeGreaterThan(positions[dimensions + 1]);
      graph.nodes.forEach((_, i) => {
        expect(Array.from(positions.slice(i * dimensions, (i + 1) * dimensions))).toEqual(
          Array.from(reversed.slice((4 - i) * dimensions, (5 - i) * dimensions)),
        );
      });
      expect(
        positions.every((value) => Number.isFinite(value) && value >= 1024 && value <= 7168),
      ).toBe(true);
    },
  );
  it("bounds deep chains and broad layers without truncating nodes", () => {
    const nodes = Array.from({ length: 100_000 }, (_, i) => ({ id: String(i), index: i }));
    const large = { nodes, edges: [] } as unknown as GraphLike;
    for (const distances of [Uint32Array.from(nodes, (_, i) => i), new Uint32Array(nodes.length)]) {
      const { positions } = layerCoordinates(nodes, graphLayers(large, distances), 2);
      expect(positions.length).toBe(200_000);
      expect(positions.every((value) => value >= 1024 && value <= 7168)).toBe(true);
    }
  });
  it("rejects stale mappings and handles an empty graph", () => {
    expect(() => graphLayers(graph, new Uint32Array(1))).toThrow(/match/);
    expect(() => graphLayers(graph, new Uint32Array([0, 1, 99, 2, 3]))).toThrow(/Invalid/);
    const empty = graphLayers({ nodes: [], edges: [] }, new Uint32Array());
    expect(layerCoordinates([], empty, 2).positions.length).toBe(0);
    expect(() => layerCoordinates([{ id: "missing" }], empty, 2)).toThrow(/missing/);
  });
  it("packs many unreachable nodes beside the reachable layers instead of dominating their height", () => {
    const nodes = Array.from({ length: 1000 }, (_, index) => ({ id: String(index), index }));
    const graph = { nodes, edges: [] } as unknown as GraphLike;
    const distances = new Uint32Array(nodes.length).fill(UNREACHABLE);
    distances[0] = 0;
    distances[1] = 1;
    const { positions } = layerCoordinates(nodes, graphLayers(graph, distances), 2);
    const unreachableX = nodes.slice(2).map((_, i) => positions[(i + 2) * 2]);
    const y = nodes.map((_, i) => positions[i * 2 + 1]);
    expect(Math.min(...unreachableX)).toBeGreaterThan(positions[2]);
    expect(new Set(unreachableX).size).toBeGreaterThan(1);
    expect(Math.max(...y) - Math.min(...y)).toBeLessThan(1500);
  });
});
