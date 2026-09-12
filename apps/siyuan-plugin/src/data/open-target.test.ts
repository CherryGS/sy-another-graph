import { describe, expect, it } from "vitest";
import { projectGraph, resolveOpenBlock } from "./graph-model";
import {
  DEFAULT_FILTERS,
  type GraphDataset,
  type GraphEdgeKind,
  type GraphNode,
} from "./types";

const ALL_TYPE_FILTERS = { ...DEFAULT_FILTERS, documentsOnly: false };

function source(
  id: string,
  index: number,
  notebook: string,
  blockType = "d",
  rootId = id,
): GraphNode {
  return {
    id,
    index,
    notebook,
    blockType,
    rootId,
    parentId: rootId === id ? undefined : rootId,
    entity: "block",
    label: id,
    path: `/${rootId}.sy`,
    degree: 0,
    color: "#fff",
    openBlockId: id,
  };
}

function mediator(
  id: string,
  index: number,
  fields: Partial<GraphNode>,
): GraphNode {
  return {
    id,
    index,
    entity: "database",
    databaseId: "db",
    label: id,
    notebook: "",
    path: "",
    degree: 0,
    color: "#fff",
    // Deliberately stale acquisition-time context to exercise view resolution.
    openBlockId: "carrier-a",
    ...fields,
  };
}

function databaseFixture(): GraphDataset {
  const edge = (from: number, to: number, kind: GraphEdgeKind) => ({
    source: from,
    target: to,
    kind,
    weight: 1,
  });
  return {
    nodes: [
      source("doc-a", 0, "A"),
      source("carrier-a", 1, "A", "av", "doc-a"),
      source("doc-b", 2, "B"),
      source("carrier-b", 3, "B", "av", "doc-b"),
      source("bound-b", 4, "B", "p", "doc-b"),
      mediator("av:db", 5, {}),
      mediator("av-item:db:detached", 6, {
        entity: "database-item",
        itemId: "detached",
      }),
      mediator("av-item:db:bound", 7, {
        entity: "database-item",
        itemId: "bound",
        boundBlockId: "bound-b",
      }),
    ],
    edges: [
      edge(1, 5, "database-embedding"),
      edge(3, 5, "database-embedding"),
      edge(5, 6, "database-membership"),
      edge(5, 7, "database-membership"),
      edge(7, 4, "database-binding"),
    ],
    notebooks: [],
    source: "siyuan",
    loadedAt: "",
    loadMs: 0,
    referenceCount: 0,
    skippedReferences: 0,
    warnings: [],
  };
}

describe("native contexts for the current graph", () => {
  it("chooses an eligible mirror in the selected notebook for the shared database and detached items", () => {
    const data = databaseFixture();
    const graph = projectGraph(data, { ...ALL_TYPE_FILTERS, notebook: "B" });
    expect(resolveOpenBlock("av:db", data, graph)).toBe("carrier-b");
    expect(resolveOpenBlock("av-item:db:detached", data, graph)).toBe(
      "carrier-b",
    );
    expect(resolveOpenBlock("carrier-a", data, graph)).toBeNull();
    expect(data.nodes[5].openBlockId).toBe("carrier-a");
  });

  it("does not reuse a context excluded by any overlapping or repeated subtree root", () => {
    const data = databaseFixture();
    const graph = projectGraph(data, {
      ...ALL_TYPE_FILTERS,
      excludeIds: ["doc-a", "carrier-a", "bound-b", "doc-a", "missing"],
    });
    expect([...graph.excludedIds].sort()).toEqual([
      "bound-b",
      "carrier-a",
      "doc-a",
    ]);
    expect(resolveOpenBlock("av:db", data, graph)).toBe("carrier-b");
    expect(resolveOpenBlock("av-item:db:detached", data, graph)).toBe(
      "carrier-b",
    );
    expect(resolveOpenBlock("av-item:db:bound", data, graph)).toBeNull();
    expect(resolveOpenBlock("bound-b", data, graph)).toBeNull();
  });

  it("opens exact hidden source blocks instead of their displayed document representative", () => {
    const data = databaseFixture();
    const graph = projectGraph(data, {
      ...ALL_TYPE_FILTERS,
      hiddenTypes: ["p", "av"],
    });
    expect(graph.representatives.get("bound-b")).toBe("doc-b");
    expect(graph.representatives.get("carrier-a")).toBe("doc-a");
    expect(resolveOpenBlock("bound-b", data, graph)).toBe("bound-b");
    expect(resolveOpenBlock("carrier-a", data, graph)).toBe("carrier-a");
    expect(resolveOpenBlock("av:db", data, graph)).toBe("carrier-a");
  });

  it("prefers the actual bound block, including when its type is hidden", () => {
    const data = databaseFixture();
    const graph = projectGraph(data, {
      ...ALL_TYPE_FILTERS,
      hiddenTypes: ["p"],
    });
    expect(resolveOpenBlock("av-item:db:bound", data, graph)).toBe("bound-b");
    expect(resolveOpenBlock("av-item:db:bound", data, graph)).not.toBe(
      "carrier-a",
    );
  });

  it("returns no database context when every embedding is excluded, even if binding relationships keep the database visible", () => {
    const data = databaseFixture();
    const graph = projectGraph(data, {
      ...ALL_TYPE_FILTERS,
      excludeIds: ["carrier-a", "carrier-b"],
    });
    expect(graph.eligibleIds.has("av:db")).toBe(true);
    expect(graph.eligibleIds.has("av-item:db:detached")).toBe(true);
    expect(resolveOpenBlock("av:db", data, graph)).toBeNull();
    expect(resolveOpenBlock("av-item:db:detached", data, graph)).toBeNull();
    expect(resolveOpenBlock("av-item:db:bound", data, graph)).toBe("bound-b");
  });

  it("does not use detached item IDs or stale openBlockId metadata as native targets", () => {
    const data = databaseFixture();
    data.edges = data.edges.filter(
      (edge) => edge.kind !== "database-embedding",
    );
    const graph = projectGraph(data, ALL_TYPE_FILTERS);
    expect(resolveOpenBlock("av-item:db:detached", data, graph)).toBeNull();
    expect(resolveOpenBlock("av:db", data, graph)).toBeNull();
    expect(resolveOpenBlock("unknown-native-id", data, graph)).toBeNull();
  });

  it("uses an eligible embedding as context when a real item's bound source is unavailable", () => {
    const data = databaseFixture();
    data.nodes[7].boundBlockId = "unavailable-block";
    data.edges = data.edges.filter((edge) => edge.kind !== "database-binding");
    const graph = projectGraph(data, ALL_TYPE_FILTERS);
    expect(resolveOpenBlock("av-item:db:bound", data, graph)).toBe("carrier-a");
  });

  it("does not open entities removed by the database presence switch", () => {
    const data = databaseFixture();
    const graph = projectGraph(data, { ...ALL_TYPE_FILTERS, databases: false });
    expect(resolveOpenBlock("av:db", data, graph)).toBeNull();
    expect(resolveOpenBlock("av-item:db:bound", data, graph)).toBeNull();
    expect(resolveOpenBlock("bound-b", data, graph)).toBe("bound-b");
  });

  it("keeps cached resolution isolated between immutable graph revisions", () => {
    const data = databaseFixture();
    const graphA = projectGraph(data, { ...ALL_TYPE_FILTERS, notebook: "A" });
    const graphB = projectGraph(data, { ...ALL_TYPE_FILTERS, notebook: "B" });
    for (let repeat = 0; repeat < 3; repeat++) {
      expect(resolveOpenBlock("av:db", data, graphA)).toBe("carrier-a");
      expect(resolveOpenBlock("av:db", data, graphB)).toBe("carrier-b");
    }
  });
});
