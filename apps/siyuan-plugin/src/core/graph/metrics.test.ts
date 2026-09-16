import { describe, expect, it } from "vitest";
import { graphDegrees } from "./metrics";
import type { GraphEdge } from "./types";

describe("snapshot-local graph metrics", () => {
  it("counts projected relationships independently of occurrence weights", () => {
    const graph = {
      nodes: [],
      edges: [
        { source: 4, target: 8, kind: "reference", weight: 20 },
        { source: 8, target: 8, kind: "reference", weight: 1 },
      ] as GraphEdge[],
    };
    expect([...graphDegrees(graph)]).toEqual([
      [4, 1],
      [8, 3],
    ]);
    expect(graphDegrees(graph)).toBe(graphDegrees(graph));
  });

  it("does not reuse metrics for a new graph with the same node identities", () => {
    const first = { nodes: [], edges: [] as GraphEdge[] };
    const next = {
      nodes: first.nodes,
      edges: [{ source: 4, target: 8, kind: "text-mention", weight: 2 }] as GraphEdge[],
    };
    expect(graphDegrees(first).size).toBe(0);
    expect(graphDegrees(next).get(4)).toBe(1);
    expect(graphDegrees(first).size).toBe(0);
  });
});
