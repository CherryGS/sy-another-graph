import { describe, expect, it } from "vitest";
import { defaultGrouping, type LayoutGrouping } from "../layout-groups/model";
import {
  applyPresetFilters,
  createPresetStore,
  migratePresetGrouping,
  presetFilters,
  readPresetStore,
  samePresetFilters,
} from "./model";
import { DEFAULT_FILTERS } from "./filters";
import { FilterSessions } from "../../application/workflows/filter-sessions";

const grouping: LayoutGrouping = {
  ...defaultGrouping(),
  mode: "sets",
  background: true,
  strength: 0.35,
  sets: [
    { id: "b", name: "Broad", enabled: true, rules: [{ kind: "text", value: "project" }] },
    { id: "a", name: "Exact", enabled: false, rules: [{ kind: "regex", value: "^project a$" }] },
  ],
};

describe("preset-owned grouping", () => {
  it("round-trips independent definitions and priority without persisting computed membership", () => {
    const store = createPresetStore("Projects", grouping);
    store.presets.push({
      id: "copy",
      name: "Copy",
      filters: presetFilters(store.presets[0].filters),
    });
    const restored = readPresetStore(JSON.parse(JSON.stringify(store)))!;
    expect(restored.version).toBe(2);
    expect(restored.presets[0].filters.grouping).toEqual(grouping);
    restored.presets[1].filters.grouping.sets.reverse();
    restored.presets[1].filters.grouping.sets[1].rules[0].value = "other";
    expect(restored.presets[0].filters.grouping.sets.map((set) => set.id)).toEqual(["b", "a"]);
    expect(restored.presets[0].filters.grouping.sets[0].rules[0].value).toBe("project");
    expect(restored.presets[0].filters.grouping).not.toHaveProperty("membership");
  });
  it("detects priority and mode changes while preserving topology-input identities", () => {
    const previous = { ...DEFAULT_FILTERS, grouping };
    const reversed = { ...grouping, sets: [...grouping.sets].reverse() };
    expect(samePresetFilters(previous, { ...previous, grouping: reversed })).toBe(false);
    const next = applyPresetFilters(previous, { ...previous, grouping: reversed });
    expect(next.excludeIds).toBe(previous.excludeIds);
    expect(next.hiddenTypes).toBe(previous.hiddenTypes);
    expect(next.exclusionRules).toBe(previous.exclusionRules);
    expect(applyPresetFilters(next, presetFilters(next))).toBe(next);
    expect(applyPresetFilters(next, { ...next, hideIsolated: true }).grouping).toBe(next.grouping);
  });
  it("migrates old global community settings separately for every v1 preset, but never overrides v2", () => {
    const old = { ...createPresetStore(), version: 1 as const };
    old.presets.push({ ...old.presets[0], id: "other" });
    const legacy = {
      ...defaultGrouping(),
      mode: "community" as const,
      strength: 0.6,
      resolution: 2,
      background: true,
    };
    const migrated = migratePresetGrouping(readPresetStore(old)!, legacy);
    expect(migrated.version).toBe(2);
    expect(migrated.presets.every((preset) => preset.filters.grouping.mode === "community")).toBe(
      true,
    );
    migrated.presets[0].filters.grouping.strength = 0.2;
    expect(migrated.presets[1].filters.grouping.strength).toBe(0.6);
    expect(legacy.strength).toBe(0.6);
    expect(migratePresetGrouping(migrated, defaultGrouping())).toBe(migrated);
    expect(old.version).toBe(1);
  });
  it("rejects damaged v2 grouping instead of silently discarding rules", () => {
    const store = createPresetStore("A", grouping);
    Reflect.deleteProperty(store.presets[0].filters, "grouping");
    expect(readPresetStore(store)).toBeNull();
    store.version = 1;
    expect(readPresetStore(store)).not.toBeNull();
  });
  it("keeps normal and temporary search groupings isolated through reset and resume", () => {
    const sessions = new FilterSessions();
    sessions.setNormal((previous) => ({ ...previous, grouping }));
    sessions.search({
      requestId: "search",
      label: "Search",
      query: "Project",
      ids: ["20260921000000-abc1234"],
    });
    expect(sessions.getSnapshot().temporary?.filters.grouping.mode).toBe("off");
    sessions.setFilters((previous) => ({
      ...previous,
      grouping: { ...defaultGrouping(), mode: "community" },
    }));
    sessions.leave();
    expect(sessions.getSnapshot().normal.grouping).toBe(grouping);
    sessions.resume();
    sessions.reset();
    expect(sessions.getSnapshot().temporary?.filters.grouping.mode).toBe("off");
    expect(sessions.getSnapshot().normal.grouping).toBe(grouping);
  });
});
