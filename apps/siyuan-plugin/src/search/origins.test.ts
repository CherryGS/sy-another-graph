import { describe, expect, it } from "vitest";
import { projectGraph, searchAncestorIds } from "../data/graph-model";
import { DEFAULT_FILTERS, type GraphDataset, type GraphFilters } from "../data/types";
import { buildSearchOrigins, searchNodeOrigin, searchOriginDescription, searchDisplayLabel } from "./origins";

const data: GraphDataset = {
  nodes: [
    ["top", "d", "top", undefined], ["doc", "d", "doc", "top"],
    ["heading", "h", "doc", "doc"], ["first", "p", "doc", "heading"],
    ["second", "p", "doc", "heading"], ["sibling", "p", "doc", "heading"],
  ].map(([id, blockType, rootId, parentId], index) => ({ id: id!, index, entity: "block", blockType, rootId, parentId,
    label: "Same title", notebook: "book", path: "/top/doc.sy", color: "#fff", degree: 0 })),
  edges: [], notebooks: [], source: "siyuan", loadedAt: "", loadMs: 0, referenceCount: 0, skippedReferences: 0, warnings: [],
};
function origins(hits: string[], filters: Partial<GraphFilters> = {}) {
  const matched = new Set(hits);
  const graph = projectGraph(data, { ...DEFAULT_FILTERS, documentsOnly: false, hierarchy: true, ...filters }, searchAncestorIds(data, matched));
  return { graph, origins: buildSearchOrigins(graph, matched) };
}

describe("search origin identity", () => {
  it("distinguishes original native identities from same-title ancestors", () => {
    const result = origins(["heading", "first", "second"]);
    expect(result.origins.matches).toEqual(new Set(["heading", "first", "second"]));
    expect(result.origins.projected.size).toBe(0);
    expect(searchNodeOrigin("heading", result.origins)).toBe("match");
    expect(searchNodeOrigin("doc", result.origins)).toBe("ancestor");
    expect(searchNodeOrigin("top", result.origins)).toBe("ancestor");
    expect(result.graph.sourceIds.has("sibling")).toBe(false);
  });
  it("marks the actual representative of hidden hits without claiming a direct document match", () => {
    const result = origins(["heading", "first", "second"], { documentsOnly: true });
    expect(result.origins.matches.size).toBe(0);
    expect(result.origins.projected).toEqual(new Map([["doc", 3]]));
    expect(searchNodeOrigin("doc", result.origins)).toBe("projected-match");
    expect(searchNodeOrigin("top", result.origins)).toBe("ancestor");
    expect(searchOriginDescription("doc", result.origins)).toContain("3 个隐藏的命中块");
  });
  it("retains direct-hit identity when the same document also carries hidden hits", () => {
    const result = origins(["doc", "first"], { documentsOnly: true });
    expect(searchNodeOrigin("doc", result.origins)).toBe("match");
    expect(result.origins.projected.get("doc")).toBe(1);
    expect(searchOriginDescription("doc", result.origins)).toContain("同时承载 1 个隐藏命中块");
  });
  it("does not resurrect excluded or out-of-scope hits through an ancestor", () => {
    const excluded = origins(["first"], { excludeIds: ["first"], documentsOnly: true });
    expect(excluded.origins.matches.size).toBe(0);
    expect(excluded.origins.projected.size).toBe(0);
    expect(searchNodeOrigin("doc", excluded.origins)).toBe("ancestor");
    const scoped = origins(["doc", "first"], { scopeId: "heading", documentsOnly: true });
    expect(searchNodeOrigin("doc", scoped.origins)).toBe("projected-match");
    expect(scoped.origins.projected.get("doc")).toBe(1);
  });
  it("adds no search identity in ordinary preset mode and leaves source text unchanged", () => {
    expect(searchNodeOrigin("doc")).toBeUndefined();
    expect(searchOriginDescription("doc")).toBeUndefined();
    expect(searchDisplayLabel("Title")).toBe("Title");
    expect(searchDisplayLabel("Title", "ancestor")).toBe("Title");
    expect(searchDisplayLabel("Title", "match")).toBe("◆ 命中 · Title");
    expect(data.nodes.every(node => node.label === "Same title")).toBe(true);
  });
});
