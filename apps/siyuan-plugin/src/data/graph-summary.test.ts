import { describe, expect, it } from "vitest";
import { getNodeTypeCounts } from "./graph-summary";
import type { GraphNode } from "./types";

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
