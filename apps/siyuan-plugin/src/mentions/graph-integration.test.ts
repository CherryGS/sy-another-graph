import { describe, expect, it } from "vitest";
import { projectGraph, numericTopology } from "../data/graph-model";
import { DEFAULT_FILTERS, type GraphDataset, type GraphEdge, type GraphNode } from "../data/types";
import { newSavedView, readSavedViews } from "../data/views";
import { restoreSelection } from "../app/selection";
import { mentionScope, withMentionEdges } from "./graph-integration";

function node(index: number, id: string, blockType = "d", rootId = id, parentId?: string): GraphNode {
  return { index, id, label: id, blockType, rootId, parentId, notebook: "book", path: `/${rootId}.sy`, degree: 0, color: "#fff", entity: "block" };
}
function data(nodes: GraphNode[]): GraphDataset {
  return { nodes, edges: [], notebooks: [], source: "siyuan", loadedAt: "", loadMs: 0, referenceCount: 0, skippedReferences: 0, warnings: [] };
}

describe("mentions inside projected native scope", () => {
  it("does not treat a display-only owning document as an eligible source or target", () => {
    const source = data([node(0, "a"), node(1, "section", "h", "a", "a"), node(2, "p", "p", "a", "section"), node(3, "outside", "p", "a", "a")]);
    const graph = projectGraph(source, { ...DEFAULT_FILTERS, scopeId: "section", hiddenTypes: ["p", "h"] });
    expect(graph.nodes.map(node => node.id)).toEqual(["a"]);
    expect(mentionScope(source, graph).entries.map(entry => entry.id)).toEqual(["section", "p"]);
    const invalid: GraphEdge = { source: 0, target: 0, kind: "text-mention", weight: 1,
      provenance: [{ sourceId: "p", targetId: "outside", kind: "text-mention", weight: 1 }] };
    expect(withMentionEdges(graph, [invalid])).toBe(graph);
  });

  it("adds mention endpoints to the same numeric topology used for neighborhoods and paths, and removes them on off", () => {
    const source = data([node(3, "a"), node(10, "b"), node(21, "p", "p", "a", "a")]);
    const base = projectGraph(source, { ...DEFAULT_FILTERS, hiddenTypes: ["p"], hierarchy: false });
    const edge: GraphEdge = { source: 3, target: 10, kind: "text-mention", weight: 2,
      provenance: [{ sourceId: "p", targetId: "b", kind: "text-mention", weight: 2 }] };
    const enabled = withMentionEdges(base, [edge]);
    expect(enabled.eligibleIds).toBe(base.eligibleIds);
    expect(enabled.nodes.map(node => node.degree)).toEqual([1, 1]);
    expect(Array.from(numericTopology(enabled).endpoints)).toEqual([0, 1]);
    expect(numericTopology(withMentionEdges(base, [])).endpoints).toHaveLength(0);
    expect(base.nodes.map(node => node.degree)).toEqual([0, 0]);
  });

  it("persists the whole activation set separately from right-panel inspection, with legacy off migration", () => {
    const saved = newSavedView("mentions", { ...DEFAULT_FILTERS, mentions: "selected" }, "inspected",
      { chosenIds: ["a", "b"], multiple: true });
    const [restored] = readSavedViews({ getItem: () => JSON.stringify([saved]) });
    expect(restored.filters.mentions).toBe("selected");
    expect(restoreSelection(restored, new Set(["a", "b", "inspected"]))).toEqual({ chosenIds: ["a", "b"], inspectedId: "inspected", multiple: true });
    expect(restoreSelection(restored, new Set(["a"]))).toEqual({ chosenIds: ["a"], inspectedId: null, multiple: true });
    const legacy = { ...saved, chosenIds: undefined, multiple: undefined, filters: { ...saved.filters, mentions: undefined } };
    const [old] = readSavedViews({ getItem: () => JSON.stringify([legacy]) });
    expect(old.filters.mentions).toBe("off");
    expect(restoreSelection(old, new Set(["inspected"])).chosenIds).toEqual(["inspected"]);
    expect(readSavedViews({ getItem: () => JSON.stringify([{ ...saved, filters: { ...saved.filters, mentions: "unknown" } }]) })).toEqual([]);
  });
});
