import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "../data/types";
import {
  applyPresetFilters, createPresetStore, presetFilters, presetName, readPresetStore, samePresetFilters,
} from "./model";

const BLOCK = "20260912000000-block01";
const OTHER = "20260912000001-block02";

describe("persistent preset schema", () => {
  it("creates independent conservative defaults and permits an intentionally empty store", () => {
    const first = createPresetStore();
    const second = createPresetStore();
    expect(first.activePresetId).toBe(first.presets[0].id);
    expect(first.presets[0]).toMatchObject({ name: "文档引用", filters: {
      references: true, hierarchy: false, mentions: "off", documentsOnly: true, hiddenTypes: [],
    } });
    first.presets[0].filters.excludeIds.push(BLOCK);
    first.presets[0].filters.hiddenTypes.push("p");
    expect(second.presets[0].filters.excludeIds).toEqual([]);
    expect(second.presets[0].filters.hiddenTypes).toEqual([]);
    expect(DEFAULT_FILTERS.excludeIds).toEqual([]);
    expect(DEFAULT_FILTERS.hiddenTypes).toEqual([]);
    expect(readPresetStore({ version: 1, presets: [], activePresetId: null })).toEqual({ version: 1, presets: [], activePresetId: null });
  });

  it("round trips custom rules, removes exploration fields, and owns copied arrays", () => {
    const store = createPresetStore();
    const filters = {
      ...DEFAULT_FILTERS, documentsOnly: false, notebook: BLOCK, scopeId: OTHER,
      references: false, hierarchy: true, hideIsolated: true, includeChildDocuments: false,
      databases: false, mentions: "selected" as const, query: "transient search",
      excludeIds: [OTHER, BLOCK, OTHER], hiddenTypes: ["future-type", "p", "d", "p"],
    };
    store.presets[0].filters = filters;
    const restored = readPresetStore({ ...store, selectedId: BLOCK })!;
    expect(restored.presets[0].filters).toEqual({
      notebook: BLOCK, scopeId: OTHER, references: false, hierarchy: true,
      hideIsolated: true, includeChildDocuments: false, databases: false,
      documentsOnly: false, mentions: "selected", excludeIds: [BLOCK, OTHER],
      hiddenTypes: ["future-type", "p"],
    });
    expect("selectedId" in restored).toBe(false);
    filters.excludeIds.length = 0;
    filters.hiddenTypes.push("h");
    expect(restored.presets[0].filters.excludeIds).toEqual([BLOCK, OTHER]);
    expect(restored.presets[0].filters.hiddenTypes).toEqual(["future-type", "p"]);
  });

  it("compares effective rules independently of search, array ordering, and document-only redundant exclusions", () => {
    const left = { ...DEFAULT_FILTERS, query: "first", excludeIds: [OTHER, BLOCK, OTHER], hiddenTypes: ["p"] };
    const right = { ...DEFAULT_FILTERS, query: "second", excludeIds: [BLOCK, OTHER], hiddenTypes: ["future-type"] };
    expect(samePresetFilters(left, right)).toBe(true);
    expect(presetFilters(left).hiddenTypes).toEqual([]);
    expect(samePresetFilters(left, { ...right, scopeId: BLOCK })).toBe(false);
    expect(samePresetFilters({ ...left, documentsOnly: false }, { ...right, documentsOnly: false })).toBe(false);
  });

  it("preserves graph revision inputs for equivalent presets and mention-only switches", () => {
    const previous = { ...DEFAULT_FILTERS, query: "keep my search", documentsOnly: false,
      excludeIds: [OTHER, BLOCK], hiddenTypes: ["p", "h"] };
    const equivalent = { ...presetFilters(previous), excludeIds: [BLOCK, OTHER, BLOCK], hiddenTypes: ["h", "p", "d"] };
    expect(applyPresetFilters(previous, equivalent)).toBe(previous);
    const mentions = applyPresetFilters(previous, { ...equivalent, mentions: "selected" });
    expect(mentions).not.toBe(previous);
    expect(mentions).toMatchObject({ mentions: "selected", query: "keep my search" });
    expect(mentions.excludeIds).toBe(previous.excludeIds);
    expect(mentions.hiddenTypes).toBe(previous.hiddenTypes);
    const excluded = applyPresetFilters(previous, { ...equivalent, excludeIds: [BLOCK] });
    expect(excluded.excludeIds).toEqual([BLOCK]);
    expect(excluded.excludeIds).not.toBe(previous.excludeIds);
    expect(excluded.hiddenTypes).toBe(previous.hiddenTypes);
    equivalent.excludeIds.push("20260912000002-block03");
    expect(excluded.excludeIds).toEqual([BLOCK]);
    expect(previous.excludeIds).toEqual([OTHER, BLOCK]);
  });

  it.each([
    null, [], {}, { version: 2, presets: [], activePresetId: null },
    { ...createPresetStore(), activePresetId: "missing" },
    { ...createPresetStore(), presets: [createPresetStore().presets[0], createPresetStore().presets[0]] },
    { ...createPresetStore(), presets: Array.from({ length: 51 }, (_, index) => ({ ...createPresetStore().presets[0], id: `preset-${index}` })) },
  ])("rejects unsupported or structurally corrupt stores without replacement: %j", (value) => {
    expect(readPresetStore(value)).toBeNull();
  });

  it.each([
    ["notebook", "missing-id"], ["scopeId", null], ["references", "true"],
    ["hierarchy", undefined], ["documentsOnly", undefined], ["documentsOnly", 1],
    ["mentions", "unknown"], ["excludeIds", [BLOCK, "invalid"]],
    ["excludeIds", Array(2001).fill(BLOCK)], ["hiddenTypes", [false]],
    ["hiddenTypes", ["future\u0081type"]], ["hiddenTypes", ["a".repeat(65)]],
    ["hiddenTypes", Array(257).fill("p")],
  ])("rejects invalid %s rules instead of silently broadening them", (field, value) => {
    const store = createPresetStore();
    store.presets[0].filters = { ...store.presets[0].filters, [field]: value };
    expect(readPresetStore(store)).toBeNull();
  });

  it("normalizes display names but rejects unsafe identities and invalid names", () => {
    expect(presetName("  Reading\n mode  ")).toBe("Reading mode");
    for (const name of ["", "   ", "a".repeat(81), "bad\u0000name", "bad\u0081name"])
      expect(() => presetName(name)).toThrow();
    for (const patch of [{ id: "../file" }, { id: "a".repeat(129) }, { name: "bad\u0081name" }]) {
      const store = createPresetStore();
      store.presets[0] = { ...store.presets[0], ...patch };
      expect(readPresetStore(store)).toBeNull();
    }
  });
});
