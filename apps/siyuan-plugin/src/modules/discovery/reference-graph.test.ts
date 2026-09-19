import { describe, expect, it } from "vitest";
import { projectGraph } from "../../core/scope/graph-model";
import { DEFAULT_FILTERS } from "../presets/filters";
import type { GraphDataset, GraphNode, GraphEdgeKind } from "../../core/graph/types";
import {
  prepareReferences,
  discoverySeeds,
  discoverySpotlight,
  supportingEdges,
} from "./reference-graph";
import { discover } from "./algorithm";

function fixture() {
  const names = ["A", "B", "X", "Y", "a-hit", "a-outside", "b-hit", "b-outside"];
  const nodes: GraphNode[] = names.map((id, i) => ({
    id,
    index: i * 7,
    label: id,
    entity: "block",
    blockType: i < 4 ? "d" : "p",
    rootId: i < 4 ? id : i < 6 ? "A" : "B",
    parentId: i < 4 ? undefined : i < 6 ? "A" : "B",
    notebook: "book",
    path: `/${i < 4 ? id : i < 6 ? "A" : "B"}.sy`,
  }));
  const specs: Array<[number, number, GraphEdgeKind]> = [
    [4, 2, "reference"],
    [5, 3, "reference"],
    [6, 2, "reference"],
    [7, 3, "reference"],
    [0, 3, "database-relation"],
    [1, 3, "text-mention"],
    [0, 1, "hierarchy"],
    [4, 0, "reference"],
  ];
  return {
    nodes,
    edges: specs.map(([a, b, kind]) => ({
      source: nodes[a].index,
      target: nodes[b].index,
      kind,
      weight: 20,
      provenance: [{ sourceId: nodes[a].id, targetId: nodes[b].id, kind, weight: 20 }],
    })),
    notebooks: [],
    source: "siyuan",
    loadedAt: "now",
    loadMs: 0,
    referenceCount: 5,
    skippedReferences: 0,
    warnings: [],
  } satisfies GraphDataset;
}
describe("scoped document reference preparation", () => {
  it("keeps search representatives from importing outside sibling citations or non-reference relationships", async () => {
    const data = fixture();
    const graph = projectGraph(data, DEFAULT_FILTERS, new Set(["a-hit", "b-hit", "X", "Y"]));
    const index = await prepareReferences(graph, new AbortController().signal);
    expect(index.documents.map((node) => node.id)).toEqual(["A", "B", "X", "Y"]);
    expect([...index.endpoints]).toEqual([0, 2, 1, 2]);
    const result = discover({
      nodes: 4,
      endpoints: index.endpoints,
      seeds: [0],
      rule: "shared-targets",
      candidate: 1,
    });
    expect(result).toMatchObject({ kind: "evidence", matches: [{ common: 1, supports: [2] }] });
    const [a, b] = supportingEdges(index, "shared-targets", 0, 1, 2);
    expect(a[0].provenance?.map((item) => item.sourceId)).toEqual(["a-hit"]);
    expect(b[0].provenance?.map((item) => item.sourceId)).toEqual(["b-hit"]);
    expect(graph.edges).toContain(a[0]);
    if (result.kind !== "evidence") throw new Error("Expected evidence");
    const spotlight = discoverySpotlight(index, "shared-targets", 1, result.matches);
    expect(spotlight.ids.sort()).toEqual(["A", "B", "X"]);
    expect(spotlight.edges).toEqual([a[0], b[0]]);
    expect(spotlight.omitted).toBe(false);
  });
  it("groups selected blocks by their available documents and deduplicates document pairs", async () => {
    const data = fixture();
    data.edges.push({ ...data.edges[0], source: data.nodes[5].index });
    const graph = projectGraph(data, { ...DEFAULT_FILTERS, documentsOnly: false, hiddenTypes: [] });
    const index = await prepareReferences(graph, new AbortController().signal);
    expect(discoverySeeds(index, ["a-hit", "A", "b-hit", "missing"])).toEqual({
      seeds: [0, 1],
      skipped: 1,
    });
    expect([...index.endpoints]).toEqual([0, 2, 0, 3, 1, 2, 1, 3]);
    const [a] = supportingEdges(index, "shared-targets", 0, 1, 2);
    expect(a).toHaveLength(2);
    const snapshot = JSON.stringify(graph);
    if (index.pairs.size) Object.freeze(index.documents);
    expect(JSON.stringify(graph)).toBe(snapshot);
  });
  it("respects disabled references and cancels superseded source preparation", async () => {
    const graph = projectGraph(fixture(), { ...DEFAULT_FILTERS, references: false });
    const index = await prepareReferences(graph, new AbortController().signal);
    expect(index.endpoints).toHaveLength(0);
    const controller = new AbortController();
    const pending = prepareReferences(graph, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
