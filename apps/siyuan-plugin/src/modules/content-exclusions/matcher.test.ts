import { describe, expect, it } from "vitest";
import type { GraphDataset, GraphNode } from "../../core/graph/types";
import { projectGraph } from "../../core/scope/graph-model";
import { explainNode } from "../../core/scope/graph-explanation";
import { retainSelection, EMPTY_SELECTION } from "../../application/sessions/selection";
import { DEFAULT_FILTERS } from "../presets/filters";
import { matchContentExclusions } from "./matcher";
import { compactExclusionSource } from "./client";
import type { ContentExclusionRule } from "./rules";

const node = (id: string, index: number, fields: Partial<GraphNode> = {}): GraphNode => ({
  id,
  index,
  label: id,
  notebook: "book",
  path: `/${id}.sy`,
  entity: "block",
  blockType: "d",
  rootId: id,
  ...fields,
});
const data: GraphDataset = {
  nodes: [
    node("date", 0, { content: "2026-09" }),
    node("category-body", 1, {
      blockType: "p",
      rootId: "date",
      parentId: "date",
      content: "Private body",
    }),
    node("child", 2, { parentId: "date", content: "Keep this child" }),
    node("child-body", 3, {
      blockType: "p",
      rootId: "child",
      parentId: "child",
      content: "2026-09 is body text, not its title",
    }),
    node("grandchild", 4, { parentId: "child" }),
    node("archive", 5, { content: "Project Archive" }),
    node("archived-child", 6, { parentId: "archive", content: "Saved note" }),
    node("other", 7),
    node("orphan", 8, { blockType: "p", rootId: "date", parentId: "missing-container" }),
    node("db", 9, { entity: "database", label: "2026-09", databaseId: "db" }),
    node("item", 10, { entity: "database-item", boundBlockId: "category-body", databaseId: "db" }),
  ],
  edges: [
    { source: 1, target: 7, kind: "reference", weight: 1 },
    { source: 3, target: 7, kind: "reference", weight: 1 },
    { source: 6, target: 7, kind: "reference", weight: 1 },
    { source: 0, target: 2, kind: "hierarchy", weight: 1 },
    { source: 9, target: 10, kind: "database-membership", weight: 1 },
    { source: 10, target: 7, kind: "database-relation", weight: 1 },
  ],
  notebooks: [],
  source: "siyuan",
  loadedAt: "",
  loadMs: 0,
  referenceCount: 3,
  skippedReferences: 0,
  warnings: [],
};
const documentRule: ContentExclusionRule = {
  kind: "regex",
  value: "^\\d{4}-\\d{2}$",
  scope: "document",
};

describe("content exclusion impact and graph boundary", () => {
  it("removes a category's own body and edges while preserving child documents, projections and references", () => {
    const result = matchContentExclusions(data, [documentRule]);
    expect(result).toEqual({
      ids: ["date", "category-body", "orphan"],
      matchedRoots: 1,
      documents: 1,
      blocks: 2,
    });
    const excluded = new Set(result.ids);
    const graph = projectGraph(data, DEFAULT_FILTERS, undefined, excluded);
    expect(graph.nodes.map((node) => node.id)).toEqual([
      "child",
      "grandchild",
      "archive",
      "archived-child",
      "other",
    ]);
    expect(
      graph.edges
        .filter((edge) => edge.kind === "reference")
        .map((edge) => [edge.source, edge.target]),
    ).toEqual([
      [2, 7],
      [6, 7],
    ]);
    expect(graph.sourceIds.has("category-body")).toBe(false);
    expect(graph.representatives.has("date")).toBe(false);
    expect(graph.sourceIds.has("item")).toBe(false);
    const selection = retainSelection(
      { ...EMPTY_SELECTION, chosenIds: ["date", "child"], inspectedId: "date" },
      graph.eligibleIds,
    );
    expect(selection.chosenIds).toEqual(["child"]);
    expect(
      explainNode(data, graph, graph, graph.eligibleIds, "date").steps.some(
        (step) => step.message.code === "graph.traceExcludedSubtree",
      ),
    ).toBe(true);
  });

  it("combines the two scopes, counts overlaps once and preserves strict search/scope boundaries", () => {
    const rules: ContentExclusionRule[] = [
      documentRule,
      { kind: "text", value: "ARCHIVE", scope: "subtree" },
    ];
    const result = matchContentExclusions(data, rules);
    expect(result.ids).toEqual(["date", "category-body", "archive", "archived-child", "orphan"]);
    const all = matchContentExclusions(data, [...rules, { ...documentRule, scope: "subtree" }]);
    expect(all.matchedRoots).toBe(2);
    expect(all.documents).toBe(5);
    expect(new Set(all.ids).size).toBe(all.ids.length);
    const scoped = projectGraph(
      data,
      { ...DEFAULT_FILTERS, scopeId: "date", includeChildDocuments: true, hierarchy: true },
      undefined,
      new Set(result.ids),
    );
    expect(scoped.nodes.map((node) => node.id)).toEqual(["child", "grandchild"]);
    expect(scoped.edges).toEqual([
      expect.objectContaining({ source: 2, target: 4, kind: "hierarchy" }),
    ]);
    expect(
      projectGraph(
        data,
        { ...DEFAULT_FILTERS, scopeId: "date", includeChildDocuments: false },
        undefined,
        new Set(result.ids),
      ).nodes,
    ).toEqual([]);
    const search = projectGraph(
      data,
      DEFAULT_FILTERS,
      new Set(["date", "child", "child-body"]),
      new Set(result.ids),
    );
    expect(search.nodes.map((node) => node.id)).toEqual(["child"]);
    expect(search.edges).toEqual([]);
  });

  it("matches full normalized titles, never body text, aliases or database names", () => {
    expect(
      matchContentExclusions(data, [{ kind: "text", value: "ＰＲＯＪＥＣＴ", scope: "document" }])
        .ids,
    ).toEqual(["archive"]);
    expect(
      matchContentExclusions(data, [{ kind: "text", value: "private body", scope: "document" }])
        .ids,
    ).toEqual([]);
    const longTitle = {
      ...data,
      nodes: [node("long", 0, { label: "Clipped…", content: "a".repeat(300) + " final title" })],
      edges: [],
    };
    expect(
      matchContentExclusions(longTitle, [
        { kind: "regex", value: "final title$", scope: "document" },
      ]).ids,
    ).toEqual(["long"]);
    const numbers = { ...data, nodes: [node("01", 0), node("101", 1), node("abc", 2)], edges: [] };
    expect(
      matchContentExclusions(numbers, [{ kind: "regex", value: "^\\D+$", scope: "document" }]).ids,
    ).toEqual(["abc"]);
    expect(
      matchContentExclusions(numbers, [{ kind: "regex", value: "^\\d{2}$", scope: "document" }])
        .ids,
    ).toEqual(["01"]);
  });

  it("supports exact block IDs, legacy parent-edge containment, and source refreshes without mutating facts", async () => {
    const before = structuredClone(data);
    const compact = await compactExclusionSource(data, new AbortController().signal);
    expect(matchContentExclusions(compact, [documentRule])).toEqual(
      matchContentExclusions(data, [documentRule]),
    );
    expect(compact.nodes.some((node) => node.content)).toBe(false);
    expect(compact.nodes.find((node) => node.id === "category-body")!.label).toBe("");
    expect(compact.edges.every((edge) => edge.kind === "hierarchy" && !edge.provenance)).toBe(true);
    expect(
      matchContentExclusions(data, [{ kind: "id", value: "category-body", scope: "document" }]).ids,
    ).toEqual(["category-body"]);
    const legacy = {
      ...data,
      nodes: [node("date", 0), node("child", 1)],
      edges: [{ source: 0, target: 1, kind: "hierarchy" as const, weight: 1 }],
    };
    expect(
      matchContentExclusions(legacy, [{ kind: "id", value: "date", scope: "subtree" }]).ids,
    ).toEqual(["date", "child"]);
    const renamed = {
      ...data,
      nodes: data.nodes.map((node) =>
        node.id === "date" ? { ...node, content: "Renamed" } : node,
      ),
    };
    expect(matchContentExclusions(renamed, [documentRule]).ids).toEqual([]);
    expect(data).toEqual(before);
  });
});
