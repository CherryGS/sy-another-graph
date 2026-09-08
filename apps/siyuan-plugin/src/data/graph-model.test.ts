import { describe, expect, it } from "vitest";
import { EMPTY_SELECTION, retainSelection, selectNode } from "../app/selection";
import {
  containedIds,
  numericTopology,
  projectGraph,
  scopeBackground,
  scopeGraph,
  type GraphView,
} from "./graph-model";
import {
  DEFAULT_FILTERS,
  type GraphDataset,
  type GraphEdgeKind,
  type GraphFilters,
  type GraphNode,
} from "./types";

function node(
  id: string,
  index: number,
  fields: Partial<GraphNode> = {},
): GraphNode {
  return {
    id,
    index,
    label: id,
    entity: "block",
    blockType: "d",
    rootId: id,
    notebook: "book",
    path: `/${id}.sy`,
    degree: 0,
    color: "#fff",
    ...fields,
  };
}

function block(
  id: string,
  index: number,
  type: string,
  rootId: string,
  parentId = rootId,
): GraphNode {
  return node(id, index, {
    blockType: type,
    rootId,
    parentId,
    path: `/${rootId}.sy`,
  });
}

type EdgeSpec = [
  source: string,
  target: string,
  kind?: GraphEdgeKind,
  weight?: number,
];

function dataset(nodes: GraphNode[], specs: EdgeSpec[]): GraphDataset {
  const byId = new Map(nodes.map((item) => [item.id, item.index]));
  return {
    nodes,
    edges: specs.map(
      ([sourceId, targetId, kind = "reference", weight = 1]) => ({
        source: byId.get(sourceId)!,
        target: byId.get(targetId)!,
        kind,
        weight,
        provenance: [{ sourceId, targetId, kind, weight }],
      }),
    ),
    notebooks: [{ id: "book", name: "Book", color: "#fff" }],
    source: "siyuan",
    loadedAt: "2026-09-09T00:00:00Z",
    loadMs: 0,
    referenceCount: specs.length,
    skippedReferences: 0,
    warnings: [],
  };
}

const filters = (overrides: Partial<GraphFilters> = {}): GraphFilters => ({
  ...DEFAULT_FILTERS,
  hierarchy: false,
  ...overrides,
});
const ids = (graph: GraphView) => graph.nodes.map((item) => item.id).sort();
const pairs = (graph: GraphView, kind: GraphEdgeKind) => {
  const byIndex = new Map(graph.nodes.map((item) => [item.index, item.id]));
  return graph.edges
    .filter((edge) => edge.kind === kind)
    .map((edge) => `${byIndex.get(edge.source)}>${byIndex.get(edge.target)}`)
    .sort();
};

// A small test-side traversal oracle exercises the actual numeric topology.
// Expected distances and memberships below come from the explicit source cases.
function reached(
  graph: GraphView,
  roots: string[],
  depth: number,
  direction: "out" | "in" | "both" = "out",
) {
  const topology = numericTopology(graph);
  let frontier = new Set(roots.map((id) => topology.idToDense.get(id)!));
  const found = new Set(frontier);
  for (let step = 0; step < depth; step++) {
    const next = new Set<number>();
    for (let index = 0; index < topology.endpoints.length; index += 2) {
      const from = topology.endpoints[index];
      const to = topology.endpoints[index + 1];
      if (direction !== "in" && frontier.has(from) && !found.has(to))
        next.add(to);
      if (direction !== "out" && frontier.has(to) && !found.has(from))
        next.add(from);
    }
    for (const member of next) found.add(member);
    frontier = next;
  }
  return new Set([...found].map((dense) => topology.denseToSource[dense]));
}

describe("source exclusion and current endpoint projection", () => {
  it.each([
    [[], "a>c"],
    [["l"], "A>c"],
    [["p"], "a>C"],
    [["l", "p"], "A>C"],
  ] as [string[], string][])(
    "projects hidden types %j directly to their owning documents",
    (hiddenTypes, expected) => {
      const data = dataset(
        [
          node("A", 10),
          node("C", 80),
          block("visible-parent", 25, "s", "A"),
          block("a", 40, "l", "A", "visible-parent"),
          block("c", 100, "p", "C"),
        ],
        [["a", "c"]],
      );
      const graph = projectGraph(data, filters({ hiddenTypes }));
      expect(pairs(graph, "reference")).toEqual([expected]);
      expect(graph.edges[0].provenance).toEqual([
        { sourceId: "a", targetId: "c", kind: "reference", weight: 1 },
      ]);
      expect(graph.eligibleIds.has("a")).toBe(!hiddenTypes.includes("l"));
      expect(pairs(graph, "reference")).not.toContain("visible-parent>c");
      expect(data.edges[0].source).toBe(40);
    },
  );

  it("excludes a subtree before its hidden references can return as document edges", () => {
    const data = dataset(
      [
        node("A", 0),
        node("C", 1),
        block("removed", 2, "l", "A"),
        block("removed-child", 3, "p", "A", "removed"),
        block("kept", 4, "l", "A"),
        block("target", 5, "p", "C"),
      ],
      [
        ["removed", "target", "reference", 2],
        ["removed-child", "target", "reference", 3],
        ["kept", "target"],
      ],
    );
    const graph = projectGraph(
      data,
      filters({ excludeIds: ["removed"], hiddenTypes: ["l"] }),
    );
    expect(graph.excludedIds).toEqual(new Set(["removed", "removed-child"]));
    expect(pairs(graph, "reference")).toEqual(["A>target"]);
    expect(graph.edges[0].weight).toBe(1);
    expect(graph.edges[0].provenance).toEqual([
      { sourceId: "kept", targetId: "target", kind: "reference", weight: 1 },
    ]);
    expect(graph.representatives.has("removed")).toBe(false);
    expect(graph.representatives.has("removed-child")).toBe(false);
  });

  it("combines projected references once while retaining every original source relationship", () => {
    const data = dataset(
      [
        node("A", 0),
        node("C", 1),
        block("a1", 2, "l", "A"),
        block("a2", 3, "l", "A"),
      ],
      [
        ["a1", "C", "reference", 2],
        ["a2", "C", "reference", 3],
      ],
    );
    const graph = projectGraph(data, filters({ hiddenTypes: ["l"] }));
    expect(pairs(graph, "reference")).toEqual(["A>C"]);
    expect(graph.edges[0].weight).toBe(5);
    expect(graph.edges[0].provenance).toEqual([
      { sourceId: "a1", targetId: "C", kind: "reference", weight: 2 },
      { sourceId: "a2", targetId: "C", kind: "reference", weight: 3 },
    ]);
    expect(data.edges.map((edge) => edge.weight)).toEqual([2, 3]);
    expect(pairs(projectGraph(data, filters()), "reference")).toEqual([
      "a1>C",
      "a2>C",
    ]);
  });

  it("keeps the source facts when both endpoints project to the same document", () => {
    const data = dataset(
      [node("A", 0), block("a", 1, "l", "A"), block("b", 2, "l", "A")],
      [["a", "b"]],
    );
    const graph = projectGraph(data, filters({ hiddenTypes: ["l"] }));
    expect(pairs(graph, "reference")).toEqual(["A>A"]);
    expect(graph.edges[0].provenance?.[0]).toEqual({
      sourceId: "a",
      targetId: "b",
      kind: "reference",
      weight: 1,
    });
  });

  it("removes a hidden original selection even though its document now represents its references", () => {
    const data = dataset(
      [node("A", 0), block("a", 1, "l", "A"), node("target", 2)],
      [["a", "target"]],
    );
    const selection = selectNode(EMPTY_SELECTION, "a", true);
    const projected = projectGraph(data, filters({ hiddenTypes: ["l"] }));
    expect(projected.representatives.get("a")).toBe("A");
    expect(retainSelection(selection, projected.eligibleIds)).toEqual(
      EMPTY_SELECTION,
    );
    expect(pairs(projected, "reference")).toEqual(["A>target"]);
  });

  it("allows a two-hop route through a current document representative despite disconnected raw members", () => {
    const data = dataset(
      [
        node("x", 10),
        node("A", 25),
        node("y", 80),
        block("a1", 100, "l", "A"),
        block("a2", 120, "l", "A"),
      ],
      [
        ["x", "a1"],
        ["a2", "y"],
      ],
    );
    const raw = projectGraph(data, filters());
    expect(reached(raw, ["x"], 10)).toEqual(new Set([10, 100]));
    const current = projectGraph(data, filters({ hiddenTypes: ["l"] }));
    expect(pairs(current, "reference")).toEqual(["A>y", "x>A"]);
    expect(reached(current, ["x"], 1)).toEqual(new Set([10, 25]));
    expect(reached(current, ["x"], 2)).toEqual(new Set([10, 25, 80]));
    expect(reached(current, ["A"], 1)).toEqual(new Set([25, 80]));
    const topology = numericTopology(current);
    expect(topology.denseToSource).toEqual([10, 25, 80]);
    expect([...topology.endpoints]).toEqual([0, 1, 1, 2]);
  });
});

describe("optional virtual containment", () => {
  it("includes each parent-to-child edge as one hop only while containment is enabled", () => {
    const data = dataset(
      [
        node("x", 0),
        node("D", 1),
        block("B", 2, "s", "D"),
        block("c", 3, "p", "D", "B"),
        node("y", 4),
      ],
      [
        ["x", "B"],
        ["c", "y"],
      ],
    );
    const disabled = projectGraph(data, filters({ hierarchy: false }));
    const enabled = projectGraph(data, filters({ hierarchy: true }));
    expect(ids(disabled)).toEqual(ids(enabled));
    expect(pairs(disabled, "hierarchy")).toEqual([]);
    expect(pairs(enabled, "hierarchy")).toEqual(["B>c", "D>B"]);
    expect(reached(disabled, ["x"], 10)).toEqual(new Set([0, 2]));
    expect(reached(enabled, ["x"], 2)).toEqual(new Set([0, 2, 3]));
    expect(reached(enabled, ["x"], 3)).toEqual(new Set([0, 2, 3, 4]));
    expect(reached(enabled, ["y"], 3, "in")).toEqual(new Set([4, 3, 2, 0, 1]));
    expect(pairs(enabled, "reference")).toEqual(["c>y", "x>B"]);
  });

  it("keeps visible children and reconnects containment through hidden parents with structural provenance", () => {
    const data = dataset(
      [
        node("D", 0),
        block("H", 1, "h", "D"),
        block("outer", 2, "s", "D", "H"),
        block("inner", 3, "l", "D", "outer"),
        block("child", 4, "p", "D", "inner"),
        node("target", 5),
      ],
      [
        ["inner", "target"],
        ["child", "target"],
      ],
    );
    const graph = projectGraph(
      data,
      filters({ hierarchy: true, hiddenTypes: ["s", "l"] }),
    );
    expect(ids(graph)).toEqual(["D", "H", "child", "target"]);
    expect(pairs(graph, "reference")).toEqual(["D>target", "child>target"]);
    expect(pairs(graph, "hierarchy")).toEqual(["D>H", "H>child"]);
    const connection = graph.edges.find(
      (edge) => edge.kind === "hierarchy" && edge.target === 4,
    )!;
    expect(connection.provenance).toEqual([
      {
        sourceId: "H",
        targetId: "child",
        kind: "hierarchy",
        weight: 1,
        viaIds: ["outer", "inner"],
      },
    ]);
    expect(reached(graph, ["H"], 1)).toEqual(new Set([1, 4]));
  });
});

describe("contained background and chosen exploration roots", () => {
  it("retains B and S while increasing and retracting external hops, without expanding from B", () => {
    const data = dataset(
      [
        node("D", 0),
        block("seed", 1, "p", "D"),
        block("background", 2, "p", "D"),
        node("outside-choice", 3),
        node("near", 4),
        node("far", 5),
        node("other-near", 6),
        node("decoy", 7),
      ],
      [
        ["seed", "near"],
        ["near", "far"],
        ["outside-choice", "other-near"],
        ["background", "decoy"],
      ],
    );
    const graph = projectGraph(data, filters());
    const background = scopeBackground(data, graph, "D", true);
    const chosen = new Set(["seed", "outside-choice"]);
    expect(background).toEqual(new Set(["D", "seed", "background"]));
    const two = scopeGraph(
      graph,
      background,
      chosen,
      reached(graph, [...chosen], 2),
      false,
    );
    expect(ids(two)).toEqual([
      "D",
      "background",
      "far",
      "near",
      "other-near",
      "outside-choice",
      "seed",
    ]);
    const one = scopeGraph(
      graph,
      background,
      chosen,
      reached(graph, [...chosen], 1),
      false,
    );
    expect(ids(one)).toEqual([
      "D",
      "background",
      "near",
      "other-near",
      "outside-choice",
      "seed",
    ]);
    expect(one.nodes.find((item) => item.id === "near")?.external).toBe(true);
    expect(one.nodes.find((item) => item.id === "background")?.external).toBe(
      false,
    );
    const zero = scopeGraph(
      graph,
      background,
      chosen,
      reached(graph, [...chosen], 0),
      false,
    );
    expect(ids(zero)).toEqual(["D", "background", "outside-choice", "seed"]);
    expect(chosen).toEqual(new Set(["seed", "outside-choice"]));
    expect(ids(two)).not.toContain("decoy");
    expect(pairs(zero, "reference")).toEqual([]);
  });

  it("hides current isolates while retaining eligible chosen members", () => {
    const data = dataset(
      [
        node("background-isolate", 0),
        node("chosen-isolate", 1),
        node("u", 2),
        node("v", 3),
      ],
      [["u", "v"]],
    );
    const graph = projectGraph(data, filters());
    const background = new Set(["background-isolate", "u", "v"]);
    const chosen = new Set(["chosen-isolate"]);
    expect(ids(scopeGraph(graph, background, chosen, null, false))).toEqual([
      "background-isolate",
      "chosen-isolate",
      "u",
      "v",
    ]);
    const view = scopeGraph(graph, background, chosen, null, true);
    expect(ids(view)).toEqual(["chosen-isolate", "u", "v"]);
    expect(pairs(view, "reference")).toEqual(["u>v"]);
  });

  it.each([true, false])(
    "honors includeChildDocuments=%s independently of containment edge visibility",
    (includeChildDocuments) => {
      const data = dataset(
        [
          node("A", 0),
          block("a", 1, "p", "A"),
          node("B", 2, { parentId: "A" }),
          block("b", 3, "p", "B"),
          node("unrelated", 4),
        ],
        [],
      );
      const expected = includeChildDocuments
        ? ["A", "a", "B", "b"]
        : ["A", "a"];
      expect(containedIds(data, "A", includeChildDocuments)).toEqual(
        new Set(expected),
      );
      const hidden = projectGraph(
        data,
        filters({ hierarchy: false, hiddenTypes: ["p"] }),
      );
      expect(scopeBackground(data, hidden, "A", includeChildDocuments)).toEqual(
        new Set(includeChildDocuments ? ["A", "B"] : ["A"]),
      );
    },
  );

  it("does not import siblings when the owning document represents hidden content inside a block scope", () => {
    const data = dataset(
      [
        node("D", 0),
        block("scope", 1, "h", "D"),
        block("hidden", 2, "p", "D", "scope"),
        block("sibling", 3, "s", "D"),
      ],
      [],
    );
    const graph = projectGraph(data, filters({ hiddenTypes: ["p"] }));
    const background = scopeBackground(data, graph, "scope", true);
    expect(background).toEqual(new Set(["scope", "D"]));
    expect(ids(scopeGraph(graph, background, new Set(), null, false))).toEqual([
      "D",
      "scope",
    ]);
  });
});

describe("database items under source exclusions", () => {
  it("does not restore an excluded bound item through a shared database or item relation", () => {
    const data = dataset(
      [
        node("removed-doc", 0),
        block("removed-block", 1, "p", "removed-doc"),
        node("kept-doc", 2),
        node("av:db", 3, {
          entity: "database",
          blockType: undefined,
          rootId: undefined,
          databaseId: "db",
        }),
        node("item:removed", 4, {
          entity: "database-item",
          rootId: undefined,
          boundBlockId: "removed-block",
          databaseId: "db",
          itemId: "removed",
        }),
        node("item:kept", 5, {
          entity: "database-item",
          rootId: undefined,
          boundBlockId: "kept-doc",
          databaseId: "db",
          itemId: "kept",
        }),
        node("item:detached", 6, {
          entity: "database-item",
          rootId: undefined,
          databaseId: "db",
          itemId: "detached",
        }),
      ],
      [
        ["av:db", "item:removed", "database-membership"],
        ["av:db", "item:kept", "database-membership"],
        ["av:db", "item:detached", "database-membership"],
        ["item:removed", "removed-block", "database-binding"],
        ["item:kept", "kept-doc", "database-binding"],
        ["item:kept", "item:removed", "database-relation"],
      ],
    );
    const graph = projectGraph(
      data,
      filters({ excludeIds: ["removed-doc"], hiddenTypes: ["p"] }),
    );
    expect(ids(graph)).toEqual([
      "av:db",
      "item:detached",
      "item:kept",
      "kept-doc",
    ]);
    expect(pairs(graph, "database-relation")).toEqual([]);
    expect(pairs(graph, "database-binding")).toEqual(["item:kept>kept-doc"]);
    expect(pairs(graph, "database-membership")).toEqual([
      "av:db>item:detached",
      "av:db>item:kept",
    ]);
    expect(graph.representatives.has("item:removed")).toBe(false);
    expect(
      graph.nodes.find((item) => item.id === "item:detached")?.rootId,
    ).toBeUndefined();
  });
});
