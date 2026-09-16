import { describe, expect, it } from "vitest";
import { presentNode, presentNodes } from "./present-nodes";
import { PALETTE } from "./palette";
import type { GraphNode, GraphEdge } from "../../core/graph/types";

describe("source facts and renderer attributes", () => {
  it("adds accents and degrees without mutating reusable source facts", () => {
    const node: GraphNode = Object.freeze({
      id: "a",
      index: 30,
      label: "Original",
      notebook: "book",
      path: "",
    });
    const graph = Object.freeze({
      nodes: [node],
      edges: [{ source: 30, target: 30, kind: "reference", weight: 4 }] as GraphEdge[],
    });
    const books = [
      { id: "other", name: "Other" },
      { id: "book", name: "Book" },
    ];
    const rendered = presentNodes(graph, books);
    expect(rendered[0]).toEqual({ ...node, degree: 2, color: PALETTE[1] });
    expect(presentNode(node, graph, books)).toEqual(rendered[0]);
    expect(node).not.toHaveProperty("color");
    expect(node).not.toHaveProperty("degree");
    expect(presentNodes({ nodes: graph.nodes, edges: [] }, books)[0].degree).toBe(0);
    expect(rendered[0].degree).toBe(2);
  });

  it("keeps notebook accents for bound items and the database accent for unbound entities", () => {
    const base: GraphNode = {
      id: "item",
      index: 0,
      label: "Item",
      notebook: "book",
      path: "",
      entity: "database-item",
    };
    const books = [{ id: "book", name: "Book" }];
    expect(presentNode(base, null, books).color).toBe(PALETTE[0]);
    expect(presentNode({ ...base, notebook: "" }, null, books).color).toBe(PALETTE[2]);
  });
});
