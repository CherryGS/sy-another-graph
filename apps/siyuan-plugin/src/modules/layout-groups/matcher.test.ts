import { describe, expect, it } from "vitest";
import { matchLayoutSets, UNGROUPED } from "./matcher";
import { reorderSets, type LayoutSet } from "./model";
import type { GraphLike } from "../../core/graph/graph-lookups";
import type { GraphNode } from "../../core/graph/types";

const nodes = [
  { id: "doc", title: "Project Alpha" },
  { id: "child", title: "Project Beta" },
  { id: "body", title: "Independent paragraph" },
  { id: "av:database", title: "Reference index" },
  { id: "other", title: "Unrelated" },
];
const sets: LayoutSet[] = [
  {
    id: "specific",
    name: "Specific",
    enabled: true,
    rules: [
      { kind: "id", value: "doc" },
      { kind: "regex", value: "^project alpha$" },
    ],
  },
  {
    id: "broad",
    name: "Broad",
    enabled: true,
    rules: [
      { kind: "text", value: "PROJECT" },
      { kind: "id", value: "av:database" },
    ],
  },
];

describe("priority membership", () => {
  it("unions rules, counts a node once per set, and gives overlap to the first enabled set", () => {
    const result = matchLayoutSets(nodes, sets);
    expect([...result.membership]).toEqual([0, 1, UNGROUPED, 1, UNGROUPED]);
    expect([...result.matches]).toEqual([1, 3]);
    expect([...result.sizes]).toEqual([1, 2]);
    expect(result.count).toBe(1);
    expect(result.keys).toEqual(["specific", "broad"]);
  });
  it("reassigns overlap after reordering, disabling and re-enabling at the same position", () => {
    const reordered = reorderSets(sets, "broad", 0);
    expect([...matchLayoutSets(nodes, reordered).sizes]).toEqual([3, 0]);
    const disabled = [{ ...reordered[0], enabled: false }, reordered[1]];
    expect([...matchLayoutSets(nodes, disabled).membership]).toEqual([
      1,
      UNGROUPED,
      UNGROUPED,
      UNGROUPED,
      UNGROUPED,
    ]);
    expect([
      ...matchLayoutSets(nodes, [{ ...disabled[0], enabled: true }, disabled[1]]).sizes,
    ]).toEqual([3, 0]);
  });
  it("does not invent descendants without source containment or group unmatched nodes", () => {
    expect([...matchLayoutSets(nodes, [sets[0]]).membership]).toEqual([
      0,
      UNGROUPED,
      UNGROUPED,
      UNGROUPED,
      UNGROUPED,
    ]);
    expect([...matchLayoutSets(nodes, []).membership]).toEqual(Array(5).fill(UNGROUPED));
    expect(matchLayoutSets(nodes, [sets[0]]).count).toBe(0);
  });
  it("matches only supplied in-scope nodes and retains regex escapes under title normalization", () => {
    const result = matchLayoutSets(
      [
        { id: "a", title: "ＡＢＣ" },
        { id: "b", title: "123" },
      ],
      [{ ...sets[0], rules: [{ kind: "regex", value: "^\\D+$" }] }],
    );
    expect([...result.membership]).toEqual([0, UNGROUPED]);
    expect([...result.sizes]).toEqual([1]);
    expect(matchLayoutSets(nodes.slice(1), sets).matches[0]).toBe(0);
  });
});

const block = (id: string, index: number, facts: Partial<GraphNode> = {}): GraphNode => ({
  id,
  index,
  label: id,
  notebook: "notebook",
  path: "",
  blockType: "d",
  rootId: id,
  ...facts,
});
const source: GraphLike = {
  nodes: [
    block("doc", 0),
    block("list", 1, { blockType: "l", rootId: "doc", parentId: "doc" }),
    block("item", 2, { blockType: "i", rootId: "doc", parentId: "list" }),
    block("paragraph", 3, { blockType: "p", rootId: "doc", parentId: "item" }),
    block("child", 4, { parentId: "doc" }),
    block("child-body", 5, { blockType: "p", rootId: "child", parentId: "child" }),
    block("grandchild", 6, { parentId: "child" }),
    block("orphan-body", 7, { blockType: "p", rootId: "child", parentId: "missing" }),
    block("other", 8),
    block("av:database", 9, { entity: "database", parentId: "doc", rootId: "doc" }),
  ],
  edges: [{ source: 0, target: 8, kind: "reference", weight: 1 }],
};
const shown = source.nodes.map((node) => ({ id: node.id, title: node.label }));
const idSet = (...ids: string[]): LayoutSet => ({
  ...sets[0],
  rules: ids.map((value) => ({ kind: "id", value })),
});

describe("native ID subtree membership", () => {
  it("includes a document, nested blocks, child documents and their blocks, without following references or logical ownership", () => {
    const result = matchLayoutSets(shown, [idSet("doc", "child", "paragraph")], source);
    expect([...result.membership]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, UNGROUPED, UNGROUPED]);
    expect([...result.matches]).toEqual([8]);
    expect([...result.sizes]).toEqual([8]);
  });
  it("includes only a specified block's subtree, without selecting its parent or sibling documents", () => {
    expect([...matchLayoutSets(shown, [idSet("list")], source).membership]).toEqual([
      UNGROUPED,
      0,
      0,
      0,
      UNGROUPED,
      UNGROUPED,
      UNGROUPED,
      UNGROUPED,
      UNGROUPED,
      UNGROUPED,
    ]);
  });
  it("uses hidden ancestors from the source but assigns and counts only displayed nodes", () => {
    const visible = shown.filter((node) => ["paragraph", "child-body", "other"].includes(node.id));
    const result = matchLayoutSets(visible, [idSet("doc")], source);
    expect([...result.membership]).toEqual([0, 0, UNGROUPED]);
    expect([...result.matches]).toEqual([2]);
  });
  it("keeps first-enabled-set priority for overlapping parent and child subtrees", () => {
    const child = { ...idSet("child"), id: "child-set" },
      parent = idSet("doc");
    expect([...matchLayoutSets(shown, [child, parent], source).sizes]).toEqual([4, 4]);
    expect([...matchLayoutSets(shown, [parent, child], source).sizes]).toEqual([8, 0]);
    expect([
      ...matchLayoutSets(shown, [{ ...child, enabled: false }, parent], source).sizes,
    ]).toEqual([0, 8]);
  });
  it("keeps title and regex rules independent while unioning them with ID subtrees", () => {
    const titles = { ...sets[0], rules: [{ kind: "regex" as const, value: "^doc$" }] };
    expect([...matchLayoutSets(shown, [titles], source).sizes]).toEqual([1]);
    const union = {
      ...idSet("list"),
      rules: [...idSet("list").rules, { kind: "text" as const, value: "other" }],
    };
    expect([...matchLayoutSets(shown, [union], source).sizes]).toEqual([4]);
    expect([...matchLayoutSets(shown, [idSet("av:database")], source).sizes]).toEqual([1]);
  });
  it("supports hierarchy-only containment and terminates malformed containment cycles", () => {
    const cycle: GraphLike = {
      nodes: [block("a", 3, { parentId: "b" }), block("b", 5)],
      edges: [{ source: 3, target: 5, kind: "hierarchy", weight: 1 }],
    };
    const result = matchLayoutSets([{ id: "b", title: "B" }], [idSet("a")], cycle);
    expect([...result.sizes]).toEqual([1]);
  });
});
