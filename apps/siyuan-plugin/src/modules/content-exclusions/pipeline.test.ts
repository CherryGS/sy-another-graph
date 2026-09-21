import { describe, expect, it } from "vitest";
import type { GraphDataset, GraphNode } from "../../core/graph/types";
import { DEFAULT_PROJECTION_RULES } from "../../core/scope/rules";
import { projectGraph } from "../../core/scope/graph-model";
import { defaultExclusionPipeline, type ExclusionContext } from "./pipeline-model";
import { runExclusionPipeline } from "./pipeline";
import { removableEmptyDocuments } from "./empty-forest";
import { compactExclusionSource } from "./client";

const doc = (
  id: string,
  index: number,
  emptyDocument = false,
  extra: Partial<GraphNode> = {},
): GraphNode => ({
  id,
  index,
  label: id,
  content: id,
  blockType: "d",
  rootId: id,
  notebook: "book",
  path: "",
  emptyDocument,
  ...extra,
});
const graph = (nodes: GraphNode[], pairs: [number, number][] = []): GraphDataset => ({
  nodes,
  edges: pairs.map(([source, target]) => ({ source, target, kind: "reference", weight: 1 })),
  notebooks: [],
  source: "siyuan",
  loadedAt: "",
  loadMs: 0,
  referenceCount: pairs.length,
  skippedReferences: 0,
  warnings: [],
});
const context = (): ExclusionContext => ({
  pipeline: {
    ...defaultExclusionPipeline(),
    enabled: { subtree: true, document: true, empty: true },
  },
  projection: { ...DEFAULT_PROJECTION_RULES },
});
const diamond = graph(
  [doc("a", 0), doc("b", 1), doc("x", 2, true), doc("y", 3, true)],
  [
    [0, 2],
    [2, 1],
    [0, 3],
    [3, 1],
  ],
);
describe("empty-document minimum spanning forest", () => {
  it("keeps one of two alternative empty routes and retains all surviving original edges", () => {
    const result = runExclusionPipeline(diamond, [], context());
    expect(result.ids).toEqual(["y"]);
    expect(result.steps?.at(-1)?.retainedIds).toEqual(["x"]);
    const kept = projectGraph(diamond, context().projection, undefined, new Set(result.ids));
    expect(kept.edges).toHaveLength(2);
  });
  it("prefers a direct nonempty route, prunes whole empty branches and disconnected empty components", () => {
    const data = graph(
      [
        doc("a", 0),
        doc("b", 1),
        doc("x", 2, true),
        doc("y", 3, true),
        doc("z", 4, true),
        doc("alone", 5, true),
      ],
      [
        [0, 1],
        [0, 2],
        [2, 1],
        [2, 3],
        [4, 5],
      ],
    );
    expect(new Set(runExclusionPipeline(data, [], context()).ids)).toEqual(
      new Set(["x", "y", "z", "alone"]),
    );
    expect(runExclusionPipeline(data, [], context()).steps?.at(-1)?.retainedIds).toEqual([]);
  });
  it("keeps unknown content and blocks, and never follows excluded relationship kinds", () => {
    const data = graph([doc("a", 0), doc("unknown", 1, undefined), doc("empty", 2, true)]);
    data.nodes[1].emptyDocument = undefined;
    data.edges = [
      { source: 0, target: 2, kind: "hierarchy", weight: 1 },
      { source: 2, target: 1, kind: "hierarchy", weight: 1 },
    ];
    expect(runExclusionPipeline(data, [], context()).ids).toEqual(["empty"]);
    const settings = context();
    settings.projection.hierarchy = true;
    expect(runExclusionPipeline(data, [], settings).ids).toEqual([]);
  });
  it("uses stable IDs despite input order, index renumbering, directions, parallel edges and self loops", () => {
    const reversed = graph(
      [doc("y", 20, true), doc("x", 40, true), doc("b", 60), doc("a", 80)],
      [
        [20, 80],
        [60, 20],
        [40, 80],
        [60, 40],
        [80, 40],
        [20, 20],
      ],
    );
    expect([...removableEmptyDocuments(reversed, new Set(["x", "y"]))]).toEqual(["y"]);
  });
  it("handles long branches iteratively", () => {
    const data = graph(
      Array.from({ length: 10000 }, (_, index) => doc(String(index), index, index !== 0)),
      Array.from({ length: 9999 }, (_, index) => [index, index + 1]),
    );
    expect(
      removableEmptyDocuments(data, new Set(data.nodes.slice(1).map((node) => node.id))).size,
    ).toBe(9999);
  });
});
describe("ordered exclusion impact", () => {
  it("retains native anchors required by logical database/item terminals", () => {
    const data = graph([
      doc("anchor", 0, true),
      doc("item", 1, false, { entity: "database-item", boundBlockId: "anchor" }),
    ]);
    data.edges = [{ source: 0, target: 1, kind: "database-binding", weight: 1 }];
    const settings = context();
    settings.projection.documentsOnly = false;
    expect(runExclusionPipeline(data, [], settings).ids).toEqual([]);
  });
  it("counts overlaps only once and changes attribution on reorder", () => {
    const data = graph([
      doc("category", 0, true),
      doc("child", 1, false, { parentId: "category" }),
    ]);
    const rules = [
      { kind: "id", value: "category", scope: "subtree" },
      { kind: "id", value: "category", scope: "document" },
    ] as const;
    const first = runExclusionPipeline(data, rules, context());
    expect(first.steps?.map((step) => step.removedIds.length)).toEqual([2, 0, 0]);
    expect(first.steps?.[1].previousIds).toEqual(["category"]);
    const reordered = context();
    reordered.pipeline.order = ["document", "subtree", "empty"];
    expect(
      runExclusionPipeline(data, rules, reordered).steps?.map((step) => step.removedIds.length),
    ).toEqual([1, 1, 0]);
  });
  it("evaluates empty connectivity after earlier steps and never restores a later exclusion", () => {
    const data = graph(
      [doc("a", 0), doc("b", 1), doc("x", 2, true)],
      [
        [0, 2],
        [2, 1],
      ],
    );
    const rules = [{ kind: "id", value: "b", scope: "document" }] as const;
    expect(new Set(runExclusionPipeline(data, rules, context()).ids)).toEqual(new Set(["b", "x"]));
    const reordered = context();
    reordered.pipeline.order = ["empty", "subtree", "document"];
    expect(runExclusionPipeline(data, rules, reordered).ids).toEqual(["b"]);
  });
  it("can exclude all empty documents while retaining child documents and respects toggles and scope", () => {
    const data = graph([
      doc("category", 0, true),
      doc("child", 1, false, { parentId: "category" }),
      doc("outside", 2, true, { notebook: "other" }),
    ]);
    const settings = context();
    settings.pipeline.preserveConnections = false;
    settings.projection.notebook = "book";
    expect(runExclusionPipeline(data, [], settings).ids).toEqual(["category"]);
    settings.pipeline.enabled.empty = false;
    expect(runExclusionPipeline(data, [], settings).ids).toEqual([]);
  });
  it("compact Worker inputs preserve scope, emptiness and enabled graph relationships without bodies", async () => {
    const compact = await compactExclusionSource(diamond, new AbortController().signal, true);
    expect(compact.nodes.every((node) => !node.content)).toBe(true);
    expect(runExclusionPipeline(compact, [], context())).toEqual(
      runExclusionPipeline(diamond, [], context()),
    );
  });
});
