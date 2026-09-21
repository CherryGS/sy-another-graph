import { describe, expect, it } from "vitest";
import { matchLayoutSets, UNGROUPED } from "./matcher";
import { reorderSets, type LayoutSet } from "./model";

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

describe("independent priority membership", () => {
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
  it("does not inherit document membership or invent a group for unmatched nodes", () => {
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
