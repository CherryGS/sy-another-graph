import { describe, expect, it } from "vitest";
import type { GraphDataset, GraphNode } from "../graph/types";
import { DEFAULT_PROJECTION_RULES, type GraphProjectionRules } from "./rules";
import { createViewProjector, projectGraph } from "./graph-model";
import { explainNode, explainRelation } from "./graph-explanation";

const node = (id: string, index: number, extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  index,
  label: id,
  notebook: "book",
  path: "",
  entity: "block",
  blockType: "d",
  rootId: id,
  ...extra,
});
const data: GraphDataset = {
  nodes: [
    node("doc", 0),
    node("a", 1, { blockType: "p", rootId: "doc", parentId: "doc" }),
    node("b", 2, { blockType: "p", rootId: "doc", parentId: "doc" }),
    node("target", 3),
    node("db", 4, { entity: "database", blockType: undefined, rootId: undefined }),
    node("item", 5, {
      entity: "database-item",
      blockType: undefined,
      rootId: undefined,
      boundBlockId: "a",
    }),
    node("floating-db", 6, { entity: "database", blockType: undefined, rootId: undefined }),
    node("orphan", 7, { blockType: "p", rootId: "missing" }),
  ],
  edges: [
    { source: 0, target: 1, kind: "hierarchy", weight: 1 },
    { source: 1, target: 3, kind: "reference", weight: 1 },
    { source: 2, target: 3, kind: "reference", weight: 3 },
    { source: 0, target: 4, kind: "database-embedding", weight: 1 },
    { source: 4, target: 5, kind: "database-membership", weight: 1 },
    { source: 5, target: 1, kind: "database-binding", weight: 1 },
  ],
  source: "siyuan",
  notebooks: [],
  loadedAt: "",
  loadMs: 0,
  referenceCount: 2,
  skippedReferences: 0,
  warnings: [],
};
const rules = (patch: Partial<GraphProjectionRules> = {}): GraphProjectionRules => ({
  ...DEFAULT_PROJECTION_RULES,
  documentsOnly: false,
  ...patch,
});
function explain(
  id: string,
  patch: Partial<GraphProjectionRules> = {},
  search?: ReadonlySet<string>,
  hideIsolated = false,
  chosen: string[] = [],
) {
  const graph = projectGraph(data, rules(patch), search);
  const background = new Set(graph.nodes.map((member) => member.id));
  const view = createViewProjector(graph).project(background, new Set(chosen), null, hideIsolated);
  return explainNode(data, graph, view, background, id);
}
const last = (result: ReturnType<typeof explain>) => result.steps.at(-1)!.message.code;

describe("on-demand filtering explanations", () => {
  it.each([
    ["absent", {}, "graph.traceMissingSource"],
    ["a", { excludeIds: ["doc"] }, "graph.traceExcludedSubtree"],
    ["a", { scopeId: "target" }, "graph.traceOutsideScope"],
    ["a", { notebook: "other" }, "graph.traceOtherNotebook"],
    ["db", { databases: false }, "graph.traceDatabasesOff"],
    ["item", { excludeIds: ["a"] }, "graph.traceBoundBlockExcluded"],
    ["item", { notebook: "other" }, "graph.traceBoundBlockNotebook"],
    ["floating-db", { notebook: "book" }, "graph.traceDatabaseDisconnected"],
    ["db", { documentsOnly: true }, "graph.traceHiddenWithoutRepresentative"],
    ["orphan", { documentsOnly: true }, "graph.traceHiddenWithoutRepresentative"],
  ] satisfies [string, Partial<GraphProjectionRules>, string][])(
    "reports the actual rejection of %s under %j",
    (id, patch, code) => {
      expect(last(explain(id, { ...patch }))).toBe(code);
    },
  );

  it("distinguishes an excluded source from a display-only document representative", () => {
    const search = new Set(["a"]);
    const a = explain("a", { documentsOnly: true }, search);
    expect(a.representative?.id).toBe("doc");
    expect(a.steps.map((step) => step.message.code)).toContain("graph.traceProjected");
    expect(last(a)).toBe("graph.traceVisible");
    const doc = explain("doc", { documentsOnly: true }, search);
    expect(doc.steps.map((step) => step.message.code)).toEqual([
      "graph.traceSourcePresent",
      "graph.traceOutsideSearch",
      "graph.traceRepresentativeOnly",
      "graph.traceVisible",
    ]);
    expect(last(explain("b", { documentsOnly: true }, search))).toBe("graph.traceOutsideSearch");
  });

  it("reports display-only isolation and retains chosen isolates", () => {
    expect(last(explain("orphan", {}, undefined, true))).toBe("graph.traceIsolatedHidden");
    expect(last(explain("orphan", {}, undefined, true, ["orphan"]))).toBe("graph.traceVisible");
    const graph = projectGraph(data, rules());
    const background = new Set(["target"]);
    const view = createViewProjector(graph).project(background, new Set(), null, false);
    expect(last(explainNode(data, graph, view, background, "a"))).toBe("graph.traceOutsideDisplay");
  });

  it("retains the exact context through derived graphs but rejects mismatched source snapshots", () => {
    const graph = projectGraph(data, rules());
    const derived = { ...graph, edges: [...graph.edges] };
    const background = new Set(graph.nodes.map((member) => member.id));
    expect(last(explainNode(data, derived, derived, background, "a"))).toBe("graph.traceVisible");
    expect(last(explainNode({ ...data }, derived, derived, background, "a"))).toBe(
      "graph.traceUnavailable",
    );
  });

  it("separates a raw connection from combined document connections and respects direction", () => {
    const graph = projectGraph(data, rules({ documentsOnly: true }));
    const result = explainRelation(data, graph, "a", "target");
    expect(result.original).toEqual([
      { kind: "reference", count: 1, reason: { code: "graph.traceRelationIncluded" } },
    ]);
    expect(result.displayed).toEqual([{ kind: "reference", count: 1, weight: 4 }]);
    expect(explainRelation(data, graph, "target", "a")).toEqual({ original: [], displayed: [] });
    const disabled = projectGraph(data, rules({ references: false }));
    expect(explainRelation(data, disabled, "a", "target").original[0].reason.code).toBe(
      "graph.traceRelationDisabled",
    );
    const excluded = projectGraph(data, rules({ excludeIds: ["a"] }));
    expect(explainRelation(data, excluded, "a", "target").original[0].reason.code).toBe(
      "graph.traceRelationSourceExcluded",
    );
  });
});
