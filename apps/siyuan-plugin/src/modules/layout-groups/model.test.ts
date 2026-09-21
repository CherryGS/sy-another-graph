import { describe, expect, it } from "vitest";
import {
  copyGrouping,
  defaultGrouping,
  formatSetDraft,
  groupingFromLegacySettings,
  parseSetDraft,
  readGrouping,
  reorderSets,
  SET_LIMIT,
  type LayoutSet,
} from "./model";

const id = "20260921000000-abc1234";
const set = (id: string): LayoutSet => ({ id, name: id, enabled: true, rules: [] });

describe("layout set definitions", () => {
  it("round-trips a union of exact native/logical IDs, title text and regex without changing regex code", () => {
    const parsed = parseSetDraft(
      `${id}, av:ABCD\nav-item:ABCD:item7\n  Project A  \n/^\\D+$/\n\\/literal/\nproject a`,
    );
    expect(parsed.error).toBeNull();
    expect(parsed.value).toEqual(
      expect.arrayContaining([
        { kind: "id", value: id },
        { kind: "id", value: "av:ABCD" },
        { kind: "id", value: "av-item:ABCD:item7" },
        { kind: "text", value: "project a" },
        { kind: "regex", value: "^\\D+$" },
        { kind: "text", value: "/literal/" },
      ]),
    );
    expect(parsed.value).toHaveLength(6);
    expect(parseSetDraft(formatSetDraft(parsed.value!)).value).toEqual(parsed.value);
  });
  it.each(["/[broken/", "/unfinished", "/a/g"])("reports invalid patterns: %s", (draft) => {
    expect(parseSetDraft(draft).value).toBeNull();
    expect(parseSetDraft(draft).error).toBeTruthy();
  });
  it("preserves ordered, independently owned set definitions", () => {
    const first = { ...set("b"), rules: [{ kind: "text" as const, value: "Project" }] };
    const grouping = { ...defaultGrouping(), mode: "sets" as const, sets: [first, set("a")] };
    const restored = readGrouping(grouping)!;
    expect(restored.sets.map((item) => item.id)).toEqual(["b", "a"]);
    restored.sets[0].rules[0].value = "changed";
    expect(first.rules[0].value).toBe("Project");
    const copied = copyGrouping(grouping);
    copied.sets.reverse();
    copied.sets[1].enabled = false;
    expect(grouping.sets[0].enabled).toBe(true);
  });
  it("rejects duplicate identities, invalid numbers and malformed or excessive rules", () => {
    for (const patch of [
      { sets: [set("a"), set("a")] },
      { sets: [set("bad/id")] },
      { strength: Infinity },
      { resolution: 0 },
      { mode: "both" },
      { mode: ["sets"] },
      { sets: [{ ...set("a"), rules: [{ kind: "regex", value: "[" }] }] },
      { sets: Array.from({ length: SET_LIMIT + 1 }, (_, index) => set(String(index))) },
      { sets: [{ ...set("a"), name: " " }] },
      {
        sets: ["a", "b"].map((id) => ({
          ...set(id),
          rules: Array.from({ length: 65 }, (_, index) => ({ kind: "regex", value: `^${index}$` })),
        })),
      },
    ])
      expect(readGrouping({ ...defaultGrouping(), ...patch })).toBeNull();
  });
  it("moves cards without changing their rules or deriving priority from enabled timestamps", () => {
    const sets = [set("a"), { ...set("b"), enabled: false }, set("c")];
    const next = reorderSets(sets, "c", 0);
    expect(next.map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(next[2]).toBe(sets[1]);
    expect(sets.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(reorderSets(next, "c", 99).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
  it("migrates finite legacy community settings without accepting coerced booleans or custom sets", () => {
    expect(
      groupingFromLegacySettings({
        communityEnabled: true,
        communityStrength: 0.42,
        communityResolution: 2,
        communityBackground: true,
      }),
    ).toEqual({
      mode: "community",
      strength: 0.42,
      resolution: 2,
      background: true,
      sets: [],
    });
    expect(
      groupingFromLegacySettings({
        communityEnabled: "true",
        communityStrength: -1,
        communityResolution: Infinity,
      }),
    ).toEqual({ ...defaultGrouping(), strength: 0 });
  });
});
