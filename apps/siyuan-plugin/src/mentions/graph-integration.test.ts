import { describe, expect, it } from "vitest";
import { projectGraph, numericTopology } from "../data/graph-model";
import { DEFAULT_FILTERS, type GraphDataset, type GraphEdge, type GraphNode } from "../data/types";
import { mentionScope, withMentionEdges } from "./graph-integration";

function node(index: number, id: string, blockType = "d", rootId = id, parentId?: string): GraphNode {
  return { index, id, label: id, blockType, rootId, parentId, notebook: "book", path: `/${rootId}.sy`, degree: 0, color: "#fff", entity: "block" };
}
function data(nodes: GraphNode[]): GraphDataset {
  return { nodes, edges: [], notebooks: [], source: "siyuan", loadedAt: "", loadMs: 0, referenceCount: 0, skippedReferences: 0, warnings: [] };
}

describe("mentions inside projected native scope", () => {
  it("keeps native nodes and references when their names are excluded from text mentions", () => {
    const source = data([node(0, "01"), node(1, "a")]);
    source.edges.push({ source: 1, target: 0, kind: "reference", weight: 1 });
    const graph = projectGraph(source, DEFAULT_FILTERS);
    expect(projectGraph(source, { ...DEFAULT_FILTERS, excludedMentionPhrases: ["01"] })).toEqual(graph);
    expect(graph.nodes.map(node => node.id)).toEqual(["01", "a"]);
    expect(graph.edges).toHaveLength(1);
  });

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

});
