import { describe, expect, it } from "vitest";
import { getGraphSummary, getNodeTypeCounts } from "./graph-summary";
import type { GraphEdge, GraphNode } from "./types";

function node(id: string, index: number, degree = 0, blockType = "p"): GraphNode {
  return { id, index, degree, blockType, label: id, notebook: "book", path: "", color: "#fff" };
}

describe("cached node type counts", () => {
  it("preserves first-seen native and logical type identities", () => {
    const nodes = Object.freeze([
      { ...node("document", 0), blockType: undefined },
      node("paragraph", 1),
      { ...node("database", 2, 0, "av"), entity: "database" as const },
      node("second-paragraph", 3),
      { ...node("item", 4), entity: "database-item" as const },
      node("unknown", 5, 0, "__proto__"),
      node("second-document", 6, 0, "d"),
    ]);
    expect(getNodeTypeCounts(nodes)).toEqual([
      ["d", 2], ["p", 2], ["database", 1], ["database-item", 1], ["__proto__", 1],
    ]);
  });

  it("does not recount one published array after remount, and refreshes changed type facts", () => {
    let reads = 0;
    const paragraph = node("source", 0);
    Object.defineProperty(paragraph, "blockType", { get: () => { reads++; return "p"; } });
    const before = Object.freeze([paragraph]);
    const original = getNodeTypeCounts(before);
    const firstReads = reads;
    expect(firstReads).toBeGreaterThan(0);
    expect(getNodeTypeCounts(before)).toBe(original);
    expect(reads).toBe(firstReads);
    const after = Object.freeze([node("source", 0, 0, "h")]);
    expect(getNodeTypeCounts(after)).toEqual([["h", 1]]);
    expect(getNodeTypeCounts(before)).toEqual([["p", 1]]);
  });
});

describe("cached graph summaries", () => {
  it("retains source-degree and Worker-degree meanings and counts weighted reference edges only", () => {
    const nodes = Object.freeze([
      node("isolated", 0, 0), node("hub", 1, 7), node("leaf", 2, 1), node("middle", 3, 3),
    ]);
    const edges: readonly GraphEdge[] = Object.freeze([
      { source: 0, target: 1, kind: "reference", weight: 4 },
      { source: 1, target: 1, kind: "reference", weight: 2 },
      { source: 1, target: 2, kind: "hierarchy", weight: 99 },
      { source: 2, target: 3, kind: "database-membership", weight: 50 },
    ]);
    const summary = getGraphSummary({ nodes, edges }, new Uint32Array([100, 0, 0, 0]));
    expect(summary).toMatchObject({
      isolated: 1, connected: 3, references: 2, referenceRecords: 6,
      coverage: 75, averageDegree: 25,
    });
    expect(summary.topNodes).toEqual([nodes[1], nodes[3], nodes[2], nodes[0]]);
  });

  it.each([0, 1, 8, 9, 64, 257])(
    "matches stable descending full-sort results for %i nodes without reordering the input",
    (size) => {
      const nodes = Object.freeze(Array.from({ length: size }, (_, index) =>
        node(`node-${index}`, index, (index * 31 + Math.floor(index / 3)) % 11),
      ));
      const originalOrder = nodes.map((value) => value.id);
      const expected = [...nodes].sort((a, b) => b.degree - a.degree).slice(0, 8);
      const summary = getGraphSummary({ nodes, edges: [] }, new Uint32Array(size));
      expect(summary.topNodes).toEqual(expected);
      expect(nodes.map((value) => value.id)).toEqual(originalOrder);
    },
  );

  it("keeps the earliest eight equal-degree nodes at the cutoff", () => {
    const nodes = Array.from({ length: 20 }, (_, index) => node(`tie-${index}`, index, 5));
    expect(getGraphSummary({ nodes, edges: [] }, new Uint32Array(20)).topNodes).toEqual(nodes.slice(0, 8));
  });

  it("reuses all aggregation work for the same arrays and Worker degree revision", () => {
    let nodeReads = 0;
    let edgeReads = 0;
    let degreeScans = 0;
    const first = node("a", 0, 1);
    Object.defineProperty(first, "degree", { get: () => { nodeReads++; return 1; } });
    const edge: GraphEdge = { source: 0, target: 1, kind: "reference", weight: 3 };
    Object.defineProperty(edge, "kind", { get: () => { edgeReads++; return "reference"; } });
    const nodes = Object.freeze([first, node("b", 1, 1)]);
    const edges = Object.freeze([edge]);
    const degrees = new Uint32Array([1, 1]);
    const iterator = degrees[Symbol.iterator].bind(degrees);
    Object.defineProperty(degrees, Symbol.iterator, {
      value: function* () { degreeScans++; yield* iterator(); },
    });
    const graph = { nodes, edges };
    const summary = getGraphSummary(graph, degrees);
    const reads = { nodeReads, edgeReads, degreeScans };
    expect(reads.nodeReads).toBeGreaterThan(0);
    expect(reads.edgeReads).toBeGreaterThan(0);
    expect(reads.degreeScans).toBeGreaterThan(0);
    expect(getGraphSummary(graph, degrees)).toBe(summary);
    expect(getGraphSummary({ nodes, edges }, degrees)).toBe(summary);
    expect({ nodeReads, edgeReads, degreeScans }).toEqual(reads);
  });

  it("invalidates changed nodes, edges, and Worker degrees independently", () => {
    const nodes = [node("before", 0, 1), node("b", 1, 0)];
    const edges: GraphEdge[] = [{ source: 0, target: 1, kind: "reference", weight: 2 }];
    const degrees = new Uint32Array([1, 1]);
    const original = getGraphSummary({ nodes, edges }, degrees);
    const changedNodes = [{ ...nodes[0], label: "After", degree: 5 }, nodes[1]];
    const renamed = getGraphSummary({ nodes: changedNodes, edges }, degrees);
    expect(renamed).not.toBe(original);
    expect(renamed.topNodes[0].label).toBe("After");
    expect(original.topNodes[0].label).toBe("before");
    const changedEdges = [{ ...edges[0], weight: 9 }];
    const reweighted = getGraphSummary({ nodes, edges: changedEdges }, degrees);
    expect(reweighted).not.toBe(original);
    expect(reweighted.referenceRecords).toBe(9);
    const recomputed = getGraphSummary({ nodes, edges }, new Uint32Array([4, 2]));
    expect(recomputed).not.toBe(original);
    expect(recomputed.averageDegree).toBe(3);
    expect(getGraphSummary({ nodes, edges }, degrees)).toBe(original);
    expect(original.referenceRecords).toBe(2);
    expect(original.averageDegree).toBe(1);
  });

  it("returns finite zero metrics for an empty graph", () => {
    expect(getGraphSummary({ nodes: [], edges: [] }, new Uint32Array())).toEqual({
      isolated: 0, connected: 0, references: 0, referenceRecords: 0,
      coverage: 0, averageDegree: 0, topNodes: [],
    });
    expect(getNodeTypeCounts([])).toEqual([]);
  });
});
