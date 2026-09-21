import { describe, expect, it } from "vitest";
import {
  createPresetStore,
  presetFilters,
  readPresetStore,
  samePresetFilters,
  applyPresetFilters,
} from "../presets/model";
import { DEFAULT_FILTERS } from "../presets/filters";
import {
  defaultExclusionPipeline,
  moveExclusionStep,
  readExclusionPipeline,
} from "./pipeline-model";

describe("preset-owned fixed exclusion steps", () => {
  it("migrates missing configuration with empty exclusions off and existing rules enabled", () => {
    const store = JSON.parse(JSON.stringify(createPresetStore()));
    delete store.presets[0].filters.exclusionPipeline;
    expect(readPresetStore(store)?.presets[0].filters.exclusionPipeline).toEqual(
      defaultExclusionPipeline(),
    );
  });
  it("rejects duplicate/missing/unknown steps and malformed toggles instead of dropping configuration", () => {
    for (const order of [
      ["subtree", "subtree", "empty"],
      ["subtree", "empty"],
      ["subtree", "document", "custom"],
    ])
      expect(readExclusionPipeline({ ...defaultExclusionPipeline(), order })).toBeNull();
    expect(
      readExclusionPipeline({ ...defaultExclusionPipeline(), enabled: { empty: true } }),
    ).toBeNull();
  });
  it("copies order and toggles independently and preserves identical configuration identity on apply", () => {
    const left = presetFilters(DEFAULT_FILTERS),
      right = presetFilters(left);
    right.exclusionPipeline.order.reverse();
    right.exclusionPipeline.enabled.empty = true;
    expect(left.exclusionPipeline).toEqual(defaultExclusionPipeline());
    expect(samePresetFilters(left, right)).toBe(false);
    const next = applyPresetFilters(DEFAULT_FILTERS, { ...left, references: false });
    expect(next.exclusionPipeline).toBe(DEFAULT_FILTERS.exclusionPipeline);
  });
  it("moves existing entries only and persists configuration without activation timestamps", () => {
    const moved = moveExclusionStep(defaultExclusionPipeline(), "empty", 0);
    expect(moved.order).toEqual(["empty", "subtree", "document"]);
    expect(moveExclusionStep(moved, "other", 0)).toBe(moved);
    const store = createPresetStore();
    store.presets[0].filters.exclusionPipeline = moved;
    expect(
      readPresetStore(JSON.parse(JSON.stringify(store)))?.presets[0].filters.exclusionPipeline,
    ).toEqual(moved);
  });
});
