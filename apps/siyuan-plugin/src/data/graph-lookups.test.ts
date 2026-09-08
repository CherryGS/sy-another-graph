import { describe, expect, it } from "vitest";
import { getGraphLookups, searchGraphNodes } from "./graph-lookups";
import type { GraphEdge, GraphNode } from "./types";

function node(id: string, index: number, label = id): GraphNode {
  return { id, index, label, notebook: "book", path: "", color: "#fff", degree: 0 };
}

describe("immutable graph lookup indexes", () => {
  it("finds sparse source indices and preserves incident order, kinds, and self-reference multiplicity", () => {
    const nodes = [node("a", 10), node("b", 80), node("isolate", 120)];
    const edges: GraphEdge[] = [
      { source: 10, target: 80, kind: "reference", weight: 2 },
      { source: 80, target: 10, kind: "hierarchy", weight: 1 },
      { source: 10, target: 10, kind: "reference", weight: 1 },
      { source: 10, target: 80, kind: "database-relation", weight: 1 },
    ];
    const lookup = getGraphLookups({ nodes, edges });
    expect(lookup.byId.get("b")).toBe(nodes[1]);
    expect(lookup.byIndex.get(80)).toBe(nodes[1]);
    expect(lookup.byIndex.get(1)).toBeUndefined();
    expect(lookup.incidentEdges(10)).toEqual(edges);
    expect(lookup.incidentEdges(80)).toEqual([edges[0], edges[1], edges[3]]);
    expect(lookup.incidentEdges(120)).toEqual([]);
    expect(lookup.incidentEdges(120)).toBe(lookup.incidentEdges(-1));
  });

  it("reuses indexes across wrapper objects and invalidates changed node or edge arrays independently", () => {
    const nodes = [node("a", 3, "Before"), node("b", 7)];
    const edges: GraphEdge[] = [{ source: 3, target: 7, kind: "reference", weight: 1 }];
    const original = getGraphLookups({ nodes, edges });
    expect(getGraphLookups({ nodes, edges })).toBe(original);
    const updatedNodes = [node("a", 3, "After"), nodes[1]];
    const renamed = getGraphLookups({ nodes: updatedNodes, edges });
    expect(renamed).not.toBe(original);
    expect(renamed.byId.get("a")?.label).toBe("After");
    expect(original.byId.get("a")?.label).toBe("Before");
    expect(renamed.incidentEdges(3)).toBe(original.incidentEdges(3));
    const updatedEdges: GraphEdge[] = [{ source: 7, target: 3, kind: "reference", weight: 4 }];
    const changed = getGraphLookups({ nodes: updatedNodes, edges: updatedEdges });
    expect(changed.byId).toBe(renamed.byId);
    expect(changed.byIndex).toBe(renamed.byIndex);
    expect(changed.incidentEdges(3)).toEqual(updatedEdges);
    expect(changed.incidentEdges(3)).not.toBe(renamed.incidentEdges(3));
  });

  it("defers incident indexing until needed and never rescans the same immutable edges", () => {
    const nodes = Object.freeze([Object.freeze(node("a", 1)), Object.freeze(node("b", 2))]);
    const edge = Object.freeze({ source: 1, target: 2, kind: "reference" as const, weight: 1 });
    const edges = [edge];
    let iterations = 0;
    Object.defineProperty(edges, Symbol.iterator, {
      value: function* () { iterations++; yield edge; },
    });
    Object.freeze(edges);
    const lookup = getGraphLookups({ nodes, edges });
    expect(lookup.byId.get("a")).toBe(nodes[0]);
    expect(iterations).toBe(0);
    expect(lookup.incidentEdges(1)).toEqual([edge]);
    expect(lookup.incidentEdges(2)).toEqual([edge]);
    expect(lookup.incidentEdges(1)).toBe(lookup.incidentEdges(1));
    expect(iterations).toBe(1);
  });
});

describe("bounded title and ID search", () => {
  it("retains source order, trimmed locale-folded titles, original ID matching, and title-only scope", () => {
    const nodes = [
      node("first", 8, "A CASE title"),
      node("CASE-ID", 2, "Unrelated"),
      node("case-id", 90, "Unrelated"),
      { ...node("content-only", 30, "Unrelated"), content: "case" },
      node("last", 1, "Lower case title"),
    ];
    expect(searchGraphNodes({ nodes }, "  CaSe  ").map((value) => value.id)).toEqual(["first", "case-id", "last"]);
    expect(searchGraphNodes({ nodes }, "case", 2)).toEqual([nodes[0], nodes[2]]);
    expect(searchGraphNodes({ nodes }, " \n ")).toEqual([]);
    expect(searchGraphNodes({ nodes }, "case", 0)).toEqual([]);
  });

  it("stops at thirty matches in a 100,000-node corpus and reuses computed lowercase titles", () => {
    let reads = 0;
    const label = () => { reads++; return "Repeated Passage"; };
    const nodes = Array.from({ length: 100_000 }, (_, index) => {
      const value = node(`block-${index}`, index);
      Object.defineProperty(value, "label", { get: label });
      return value;
    });
    const first = searchGraphNodes({ nodes }, "repeated");
    expect(first).toHaveLength(30);
    expect(first[29]).toBe(nodes[29]);
    expect(reads).toBe(30);
    expect(searchGraphNodes({ nodes }, "PASSAGE", 10)).toEqual(nodes.slice(0, 10));
    expect(reads).toBe(30);
  });

  it("refreshes cached labels for a new published node array", () => {
    const oldNodes = [node("a", 0, "Before")];
    expect(searchGraphNodes({ nodes: oldNodes }, "before")).toEqual(oldNodes);
    const newNodes = [node("a", 0, "After")];
    expect(searchGraphNodes({ nodes: newNodes }, "before")).toEqual([]);
    expect(searchGraphNodes({ nodes: newNodes }, "after")).toEqual(newNodes);
    expect(searchGraphNodes({ nodes: oldNodes }, "before")).toEqual(oldNodes);
  });
});
