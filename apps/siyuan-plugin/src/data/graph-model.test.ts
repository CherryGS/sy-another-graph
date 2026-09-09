import { describe, expect, it } from "vitest";
import { EMPTY_SELECTION, retainSelection, selectNode } from "../app/selection";
import {
  containedIds,
  createViewProjector,
  numericTopology,
  projectGraph,
  resolveOpenBlock,
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

describe("source containment index reuse", () => {
  it("shares the native parent index between scope membership and background projection", () => {
    let parentReads = 0;
    const child = block("child", 1, "p", "A");
    Object.defineProperty(child, "parentId", {
      get: () => { parentReads++; return "A"; },
      enumerable: true,
    });
    const data = dataset([node("A", 0), child, node("other", 2)], []);
    const current = projectGraph(data, filters({ hierarchy: true }));
    const initialReads = parentReads;
    expect(initialReads).toBeGreaterThan(0);
    const first = containedIds(data, "A");
    expect(first).toEqual(new Set(["A", "child"]));
    first.clear();
    expect(scopeBackground(data, current, "A", false)).toEqual(new Set(["A", "child"]));
    expect(containedIds({ nodes: data.nodes, edges: data.edges }, "A")).toEqual(new Set(["A", "child"]));
    expect(parentReads).toBe(initialReads);
  });

  it("rebuilds containment after either the native nodes or fallback hierarchy edges change", () => {
    const data = dataset([node("A", 0), node("B", 1), node("child-doc", 2)], [["A", "child-doc", "hierarchy"]]);
    expect(containedIds(data, "A")).toEqual(new Set(["A", "child-doc"]));
    const moved = { ...data, edges: [{ source: 1, target: 2, kind: "hierarchy" as const, weight: 1 }] };
    expect(containedIds(moved, "A")).toEqual(new Set(["A"]));
    expect(containedIds(moved, "B")).toEqual(new Set(["B", "child-doc"]));
    const nativeParent = { ...data, nodes: [data.nodes[0], data.nodes[1], { ...data.nodes[2], parentId: "B" }] };
    expect(containedIds(nativeParent, "A")).toEqual(new Set(["A"]));
    expect(containedIds(nativeParent, "B")).toEqual(new Set(["B", "child-doc"]));
    expect(containedIds(data, "A")).toEqual(new Set(["A", "child-doc"]));
  });
});

describe("stable views within one current graph revision", () => {
  it("reuses the entire view for equivalent neighborhood membership and avoids rescanning edges", () => {
    const data = dataset([node("A", 0), node("B", 1), node("outside", 2)], [["A", "B"], ["B", "outside"]]);
    const graph = projectGraph(data, filters());
    let edgeReads = 0;
    for (const edge of graph.edges) {
      const source = edge.source;
      Object.defineProperty(edge, "source", { get: () => { edgeReads++; return source; } });
    }
    const projector = createViewProjector(graph);
    const first = projector.project(new Set(["A"]), new Set(["A"]), new Set([0, 1]), false);
    const reads = edgeReads;
    expect(reads).toBeGreaterThan(0);
    const repeated = projector.project(new Set(["A"]), new Set(["A", "B"]), new Set([1, 0]), false);
    expect(repeated).toBe(first);
    expect(repeated.nodes).toBe(first.nodes);
    expect(repeated.edges).toBe(first.edges);
    expect(edgeReads).toBe(reads);
  });

  it("keeps all of B and never admits outside choices or changing neighborhood results", () => {
    const graph = projectGraph(dataset([node("B", 0), node("S", 1), node("near", 2), node("far", 3)], [["S", "near"], ["near", "far"]]), filters());
    const projector = createViewProjector(graph);
    const background = new Set(["B", "S", "near"]);
    const chosen = new Set(["S"]);
    const one = projector.project(background, chosen, new Set([1, 2]), false);
    const two = projector.project(background, chosen, new Set([1, 2, 3]), false);
    const zero = projector.project(background, chosen, new Set([1]), false);
    expect(ids(one)).toEqual(["B", "S", "near"]);
    expect(two).toBe(one);
    expect(zero).toBe(one);
    expect(projector.project(background, new Set(["S", "far"]), new Set([3]), false)).toBe(one);
    expect(pairs(zero, "reference")).toEqual(["S>near"]);
  });

  it("changes the display boundary while retaining node objects and an unchanged edge set", () => {
    const graph = projectGraph(dataset([node("A", 0), node("B", 1), node("unused", 2)], [["A", "B"]]), filters());
    const projector = createViewProjector(graph);
    const chosen = new Set(["A"]);
    const reached = new Set([0, 1]);
    const subset = projector.project(new Set(["A", "B"]), chosen, reached, false);
    const full = projector.project(new Set(["A", "B", "unused"]), chosen, reached, false);
    expect(full).not.toBe(subset);
    expect(full.nodes[0]).toBe(subset.nodes[0]);
    expect(full.nodes[1]).toBe(subset.nodes[1]);
    expect(full.edges).toBe(subset.edges);
    const narrowed = projector.project(new Set(["A"]), chosen, reached, false);
    expect(ids(narrowed)).toEqual(["A"]);
    expect(narrowed.nodes[0]).toBe(subset.nodes[0]);
    expect(narrowed.edges).toEqual([]);
  });

  it("retains chosen isolates and reuses an unchanged isolated-node result", () => {
    const graph = projectGraph(dataset([node("a", 0), node("b", 1), node("isolate", 2)], [["a", "b"]]), filters());
    const projector = createViewProjector(graph);
    const background = new Set(["a", "b", "isolate"]);
    const chosen = new Set(["a"]);
    const hidden = projector.project(background, chosen, new Set([0, 1]), true);
    expect(ids(hidden)).toEqual(["a", "b"]);
    expect(projector.project(background, chosen, new Set([1, 0]), true)).toBe(hidden);
    const kept = projector.project(background, new Set(["a", "isolate"]), new Set([0, 1, 2]), true);
    expect(ids(kept)).toEqual(["a", "b", "isolate"]);
    expect(kept.edges).toBe(hidden.edges);
    expect(projector.project(background, new Set(["a", "isolate"]), null, false)).toBe(kept);
  });

  it("does not reuse previous-revision labels, edge weights or provenance just because IDs match", () => {
    const before = projectGraph(dataset([node("a", 0, { label: "Before" }), node("b", 1)], [["a", "b", "reference", 1]]), filters());
    const after = projectGraph(dataset([node("a", 0, { label: "After" }), node("b", 1)], [["a", "b", "reference", 9]]), filters());
    const background = new Set(["a", "b"]);
    const chosen = new Set(["a"]);
    const focus = new Set([0, 1]);
    const oldView = createViewProjector(before).project(background, chosen, focus, false);
    const newView = createViewProjector(after).project(background, chosen, focus, false);
    expect(newView).not.toBe(oldView);
    expect(newView.nodes[0].label).toBe("After");
    expect(newView.edges[0].weight).toBe(9);
    expect(newView.edges[0].provenance?.[0].weight).toBe(9);
    expect(oldView.nodes[0].label).toBe("Before");
    expect(oldView.edges[0].weight).toBe(1);
  });
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

// Independent shortest-path oracle over the exact dense topology sent to the Worker.
function shortestPath(
  graph: GraphView,
  sourceId: string,
  targetId: string,
  direction: "out" | "in" | "both",
): string[] | null {
  const topology = numericTopology(graph);
  const source = topology.idToDense.get(sourceId);
  const target = topology.idToDense.get(targetId);
  if (source === undefined || target === undefined) return null;
  const previous = new Map<number, number | null>([[source, null]]);
  const queue = [source];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    if (current === target) {
      const path: string[] = [];
      for (let item: number | null = current; item !== null; item = previous.get(item)!)
        path.push(graph.nodes[item].id);
      return path.reverse();
    }
    const add = (next: number) => {
      if (previous.has(next)) return;
      previous.set(next, current);
      queue.push(next);
    };
    for (let index = 0; index < topology.endpoints.length; index += 2) {
      const from = topology.endpoints[index];
      const to = topology.endpoints[index + 1];
      if (direction !== "in" && from === current) add(to);
      if (direction !== "out" && to === current) add(from);
    }
  }
  return null;
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
  it("retains the complete bounded background while depth changes only chosen-root highlights", () => {
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
        ["seed", "background"],
        ["seed", "near"],
        ["near", "far"],
        ["outside-choice", "other-near"],
        ["background", "decoy"],
      ],
    );
    const graph = projectGraph(data, filters({ scopeId: "D" }));
    const background = scopeBackground(data, graph, "D", true);
    const chosen = new Set(["seed"]);
    expect(background).toEqual(new Set(["D", "seed", "background"]));
    const two = scopeGraph(
      graph,
      background,
      chosen,
      reached(graph, [...chosen], 2),
      false,
    );
    expect(ids(two)).toEqual(["D", "background", "seed"]);
    const one = scopeGraph(
      graph,
      background,
      chosen,
      reached(graph, [...chosen], 1),
      false,
    );
    expect(ids(one)).toEqual(["D", "background", "seed"]);
    const zero = scopeGraph(
      graph,
      background,
      chosen,
      reached(graph, [...chosen], 0),
      false,
    );
    expect(ids(zero)).toEqual(["D", "background", "seed"]);
    expect(chosen).toEqual(new Set(["seed"]));
    expect(reached(graph, ["seed"], 0)).toEqual(new Set([1]));
    expect(reached(graph, ["seed"], 1)).toEqual(new Set([1, 2]));
    expect(reached(graph, ["seed"], 100)).toEqual(new Set([1, 2]));
    expect(ids(two)).not.toContain("decoy");
    expect(pairs(zero, "reference")).toEqual(["seed>background"]);
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
    const background = new Set(["background-isolate", "chosen-isolate", "u", "v"]);
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
        filters({ scopeId: "A", includeChildDocuments, hierarchy: false, hiddenTypes: ["p"] }),
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
    const graph = projectGraph(data, filters({ scopeId: "scope", hiddenTypes: ["p"] }));
    const background = scopeBackground(data, graph, "scope", true);
    expect(background).toEqual(new Set(["scope", "D"]));
    expect(ids(scopeGraph(graph, background, new Set(), null, false))).toEqual([
      "D",
      "scope",
    ]);
  });
});

describe("strict source scope before projection and traversal", () => {
  it.each(["out", "in", "both"] as const)("does not leave and re-enter B during %s traversal or shortest paths", (direction) => {
    const data = dataset([
      node("D", 0), block("a", 10, "p", "D"), block("b", 20, "p", "D"),
      node("child-doc", 30, { parentId: "D" }),
      block("child-bridge", 40, "p", "child-doc"), node("outside", 90),
    ], [
      ["a", "child-bridge"], ["child-bridge", "b"],
      ["a", "outside"], ["outside", "b"], ["b", "b"],
    ]);
    const source = direction === "in" ? "b" : "a";
    const target = direction === "in" ? "a" : "b";
    expect(shortestPath(projectGraph(data, filters()), source, target, direction)).not.toBeNull();
    const bounded = projectGraph(data, filters({ scopeId: "D", includeChildDocuments: false }));
    expect(ids(bounded)).toEqual(["D", "a", "b"]);
    expect([...numericTopology(bounded).endpoints]).toEqual([2, 2]);
    expect(shortestPath(bounded, source, target, direction)).toBeNull();
    expect(reached(bounded, [source], 100, direction)).toEqual(new Set([source === "a" ? 10 : 20]));
    const expandedScope = projectGraph(data, filters({ scopeId: "D", includeChildDocuments: true }));
    expect(shortestPath(expandedScope, source, target, direction)).toEqual(
      direction === "in" ? ["b", "child-bridge", "a"] : ["a", "child-bridge", "b"],
    );
    expect(ids(expandedScope)).not.toContain("outside");
  });

  it("keeps a document representative openable while rejecting its outside facts and hidden siblings", () => {
    const data = dataset([
      node("D", 0), block("scope", 1, "h", "D"),
      block("a", 10, "p", "D", "scope"), block("b", 20, "p", "D", "scope"),
      block("hidden-in", 30, "l", "D", "scope"),
      block("hidden-out", 40, "l", "D"), node("outside", 50),
    ], [
      ["hidden-in", "b", "reference", 2],
      ["a", "hidden-out", "reference", 3], ["hidden-out", "b", "reference", 4],
      ["D", "a", "reference", 100], ["a", "D", "reference", 200],
      ["a", "outside"], ["outside", "b"], ["D", "D", "reference", 300],
    ]);
    const scoped = filters({ scopeId: "scope", hiddenTypes: ["l"] });
    const graph = projectGraph(data, scoped);
    expect(ids(graph)).toEqual(["D", "a", "b", "scope"]);
    expect(scopeBackground(data, graph, "scope", true)).toEqual(graph.eligibleIds);
    expect(graph.representatives.get("hidden-in")).toBe("D");
    expect(graph.representatives.has("hidden-out")).toBe(false);
    expect(graph.eligibleIds.has("hidden-in")).toBe(false);
    expect(retainSelection(selectNode(EMPTY_SELECTION, "D"), graph.eligibleIds).chosenIds).toEqual(["D"]);
    expect(resolveOpenBlock("D", data, graph)).toBe("D");
    expect(resolveOpenBlock("hidden-in", data, graph)).toBe("hidden-in");
    expect(resolveOpenBlock("hidden-out", data, graph)).toBeNull();
    expect(pairs(graph, "reference")).toEqual(["D>b"]);
    expect(graph.edges[0]).toMatchObject({ weight: 2, provenance: [
      { sourceId: "hidden-in", targetId: "b", kind: "reference", weight: 2 },
    ] });
    for (const direction of ["out", "in", "both"] as const)
      expect(shortestPath(graph, direction === "in" ? "b" : "a", direction === "in" ? "a" : "b", direction)).toBeNull();

    const insideReferences = dataset(data.nodes, [["a", "hidden-in"], ["hidden-in", "b"]]);
    expect(shortestPath(projectGraph(insideReferences, scoped), "a", "b", "out")).toEqual(["a", "D", "b"]);
    const withHierarchy = projectGraph(data, { ...scoped, hierarchy: true });
    expect(pairs(withHierarchy, "hierarchy")).toEqual(["scope>a", "scope>b"]);
    expect(withHierarchy.edges.filter((edge) => edge.kind === "hierarchy").every((edge) =>
      edge.provenance?.every((origin) => origin.sourceId === "scope"),
    )).toBe(true);
    const excluded = projectGraph(data, { ...scoped, excludeIds: ["hidden-in"] });
    expect(ids(excluded)).toEqual(["a", "b", "scope"]);
    expect(excluded.edges).toEqual([]);
    expect(projectGraph(data, { ...scoped, excludeIds: ["scope"] }).nodes).toEqual([]);
    expect(projectGraph(data, { ...scoped, excludeIds: ["D"] }).nodes).toEqual([]);
  });

  it("preserves in-scope projected self references without importing an outside source with the same representative", () => {
    const data = dataset([
      node("D", 0), block("scope", 1, "h", "D"),
      block("first", 2, "l", "D", "scope"), block("second", 3, "l", "D", "scope"),
      block("sibling", 4, "l", "D"),
    ], [["first", "second", "reference", 2], ["first", "sibling", "reference", 9]]);
    const graph = projectGraph(data, filters({ scopeId: "scope", hiddenTypes: ["l"] }));
    expect(pairs(graph, "reference")).toEqual(["D>D"]);
    expect(graph.edges[0]).toMatchObject({ weight: 2, provenance: [
      { sourceId: "first", targetId: "second", kind: "reference", weight: 2 },
    ] });
  });

  it("does not invent database membership inside native scope and retains notebook-filtered databases without that scope", () => {
    const data = dataset([
      node("D", 0), block("carrier", 1, "av", "D"), block("inside", 2, "p", "D"),
      node("other", 3, { notebook: "other-book" }),
      node("av:db", 4, { entity: "database", rootId: undefined, databaseId: "db", notebook: "" }),
      node("item:inside", 5, { entity: "database-item", rootId: undefined, databaseId: "db", boundBlockId: "inside", notebook: "" }),
      node("item:detached", 6, { entity: "database-item", rootId: undefined, databaseId: "db", notebook: "" }),
      node("item:other", 7, { entity: "database-item", rootId: undefined, databaseId: "db", boundBlockId: "other", notebook: "" }),
    ], [
      ["carrier", "av:db", "database-embedding"],
      ["av:db", "item:inside", "database-membership"],
      ["av:db", "item:detached", "database-membership"],
      ["av:db", "item:other", "database-membership"],
      ["item:inside", "inside", "database-binding"], ["item:other", "other", "database-binding"],
      ["item:inside", "item:detached", "database-relation"],
      ["item:detached", "item:other", "database-relation"], ["carrier", "inside"],
    ]);
    const scoped = projectGraph(data, filters({ scopeId: "D", notebook: "book", hierarchy: true }));
    expect(ids(scoped)).toEqual(["D", "carrier", "inside"]);
    expect(scopeBackground(data, scoped, "D", true)).toEqual(scoped.eligibleIds);
    expect(scoped.edges.map((edge) => edge.kind).sort()).toEqual(["hierarchy", "hierarchy", "reference"]);
    expect(pairs(scoped, "hierarchy")).toEqual(["D>carrier", "D>inside"]);
    const notebook = projectGraph(data, filters({ notebook: "book" }));
    expect(ids(notebook)).toEqual(["D", "av:db", "carrier", "inside", "item:detached", "item:inside"]);
    for (const kind of ["database-embedding", "database-membership", "database-binding", "database-relation"] as const)
      expect(pairs(notebook, kind).length).toBeGreaterThan(0);
    expect(shortestPath(notebook, "carrier", "item:detached", "out")).toEqual(["carrier", "av:db", "item:detached"]);
    expect(shortestPath(scoped, "carrier", "item:detached", "out")).toBeNull();
    expect(projectGraph(data, filters({ scopeId: "D", notebook: "other-book" })).nodes).toEqual([]);
    expect(projectGraph(data, filters({ scopeId: "missing" })).nodes).toEqual([]);
    expect(projectGraph(data, filters({ scopeId: "av:db" })).nodes).toEqual([]);
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
