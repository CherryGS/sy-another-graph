import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "./filters";
import {
  applyPresetFilters,
  createPresetStore,
  presetFilters,
  presetName,
  readPresetStore,
  samePresetFilters,
} from "./model";

const BLOCK = "20260912000000-block01";
const OTHER = "20260912000001-block02";

describe("persistent preset schema", () => {
  it("creates independent conservative defaults and permits an intentionally empty store", () => {
    const first = createPresetStore();
    const second = createPresetStore();
    expect(first.activePresetId).toBe(first.presets[0].id);
    expect(first.presets[0]).toMatchObject({
      name: "Document references",
      filters: {
        references: true,
        hierarchy: false,
        mentions: "off",
        documentsOnly: true,
        hiddenTypes: [],
      },
    });
    first.presets[0].filters.excludeIds.push(BLOCK);
    first.presets[0].filters.hiddenTypes.push("p");
    first.presets[0].filters.excludedMentionPhrases.push("01");
    expect(second.presets[0].filters.excludeIds).toEqual([]);
    expect(second.presets[0].filters.hiddenTypes).toEqual([]);
    expect(DEFAULT_FILTERS.excludeIds).toEqual([]);
    expect(DEFAULT_FILTERS.hiddenTypes).toEqual([]);
    expect(second.presets[0].filters.excludedMentionPhrases).toEqual([]);
    expect(DEFAULT_FILTERS.excludedMentionPhrases).toEqual([]);
    expect(readPresetStore({ version: 1, presets: [], activePresetId: null })).toEqual({
      version: 1,
      presets: [],
      activePresetId: null,
    });
  });

  it("round trips custom rules, removes exploration fields, and owns copied arrays", () => {
    const store = createPresetStore();
    const filters = {
      ...DEFAULT_FILTERS,
      documentsOnly: false,
      notebook: BLOCK,
      scopeId: OTHER,
      references: false,
      hierarchy: true,
      hideIsolated: true,
      includeChildDocuments: false,
      databases: false,
      mentions: "selected" as const,
      query: "transient search",
      excludeIds: [OTHER, BLOCK, OTHER],
      hiddenTypes: ["future-type", "p", "d", "p"],
      excludedMentionPhrases: [" ０１ ", "Graph Theory", "GRAPH THEORY"],
    };
    store.presets[0].filters = filters;
    const restored = readPresetStore({ ...store, selectedId: BLOCK })!;
    expect(restored.presets[0].filters).toEqual({
      notebook: BLOCK,
      scopeId: OTHER,
      references: false,
      hierarchy: true,
      hideIsolated: true,
      includeChildDocuments: false,
      databases: false,
      documentsOnly: false,
      mentions: "selected",
      excludeIds: [BLOCK, OTHER],
      hiddenTypes: ["future-type", "p"],
      excludedMentionPhrases: ["01", "graph theory"],
      excludedMentionPatterns: [],
      exclusionRules: [],
      exclusionPipeline: DEFAULT_FILTERS.exclusionPipeline,
      grouping: DEFAULT_FILTERS.grouping,
    });
    expect("selectedId" in restored).toBe(false);
    filters.excludeIds.length = 0;
    filters.hiddenTypes.push("h");
    filters.excludedMentionPhrases.length = 0;
    expect(restored.presets[0].filters.excludeIds).toEqual([BLOCK, OTHER]);
    expect(restored.presets[0].filters.hiddenTypes).toEqual(["future-type", "p"]);
    expect(restored.presets[0].filters.excludedMentionPhrases).toEqual(["01", "graph theory"]);
  });

  it("restores existing v1 presets with an empty phrase exclusion list", () => {
    const legacy = createPresetStore();
    Reflect.deleteProperty(legacy.presets[0].filters, "excludedMentionPhrases");
    Reflect.deleteProperty(legacy.presets[0].filters, "excludedMentionPatterns");
    Reflect.deleteProperty(legacy.presets[0].filters, "exclusionRules");
    const restored = readPresetStore(legacy)!;
    expect(restored.activePresetId).toBe(legacy.activePresetId);
    expect(restored.presets[0].filters.excludedMentionPhrases).toEqual([]);
    expect(restored.presets[0].filters.excludedMentionPatterns).toEqual([]);
    expect(restored.presets[0].filters.exclusionRules).toEqual([]);
  });

  it("round trips mixed content exclusions, retains old IDs, and owns nested rule objects", () => {
    const store = createPresetStore();
    store.presets[0].filters.excludeIds = [BLOCK];
    store.presets[0].filters.exclusionRules = [
      { kind: "regex", value: "^\\D+$", scope: "document" },
      { kind: "text", value: " Archive ", scope: "subtree" },
      { kind: "id", value: OTHER, scope: "document" },
    ];
    const restored = readPresetStore(JSON.parse(JSON.stringify(store)))!.presets[0].filters;
    expect(restored.excludeIds).toEqual([BLOCK]);
    expect(restored.exclusionRules).toEqual(
      expect.arrayContaining([
        { kind: "regex", value: "^\\D+$", scope: "document" },
        { kind: "text", value: "archive", scope: "subtree" },
        { kind: "id", value: OTHER, scope: "document" },
      ]),
    );
    const previous = { ...DEFAULT_FILTERS, ...restored };
    expect(
      applyPresetFilters(previous, {
        ...restored,
        exclusionRules: [...restored.exclusionRules].reverse(),
      }),
    ).toBe(previous);
    const switched = applyPresetFilters(previous, { ...restored, mentions: "all" });
    expect(switched.exclusionRules).toBe(previous.exclusionRules);
    const copy = presetFilters(restored);
    copy.exclusionRules[0].value = "changed";
    expect(copy.exclusionRules).not.toEqual(restored.exclusionRules);
    expect(samePresetFilters(previous, { ...restored, exclusionRules: [] })).toBe(false);
  });

  it("persists regex separately from legacy slash literals and preserves source case", () => {
    const store = createPresetStore();
    store.presets[0].filters.excludedMentionPhrases = ["/01/"];
    store.presets[0].filters.excludedMentionPatterns = ["\\D", "^\\d{2}$", "\\D"];
    const filters = readPresetStore(JSON.parse(JSON.stringify(store)))!.presets[0].filters;
    expect(filters.excludedMentionPhrases).toEqual(["/01/"]);
    expect(filters.excludedMentionPatterns).toEqual(["\\D", "^\\d{2}$"]);
    expect(
      samePresetFilters(filters, { ...filters, excludedMentionPatterns: ["\\d", "^\\d{2}$"] }),
    ).toBe(false);
    const applied = applyPresetFilters(
      { ...DEFAULT_FILTERS, ...filters },
      { ...filters, excludedMentionPatterns: [] },
    );
    expect(applied.excludedMentionPatterns).toEqual([]);
    expect(applied.excludedMentionPhrases).toBe(filters.excludedMentionPhrases);
  });

  it("compares effective rules independently of search, array ordering, and document-only redundant exclusions", () => {
    const left = {
      ...DEFAULT_FILTERS,
      query: "first",
      excludeIds: [OTHER, BLOCK, OTHER],
      hiddenTypes: ["p"],
    };
    const right = {
      ...DEFAULT_FILTERS,
      query: "second",
      excludeIds: [BLOCK, OTHER],
      hiddenTypes: ["future-type"],
    };
    expect(samePresetFilters(left, right)).toBe(true);
    expect(presetFilters(left).hiddenTypes).toEqual([]);
    expect(samePresetFilters(left, { ...right, scopeId: BLOCK })).toBe(false);
    expect(
      samePresetFilters({ ...left, documentsOnly: false }, { ...right, documentsOnly: false }),
    ).toBe(false);
    expect(samePresetFilters(left, { ...left, excludedMentionPhrases: ["01"] })).toBe(false);
    expect(
      samePresetFilters(
        { ...left, excludedMentionPhrases: [" ０１ ", "BETA"] },
        { ...left, excludedMentionPhrases: ["beta", "01", "beta"] },
      ),
    ).toBe(true);
  });

  it("preserves graph revision inputs for equivalent presets and mention-only switches", () => {
    const previous = {
      ...DEFAULT_FILTERS,
      query: "keep my search",
      documentsOnly: false,
      excludeIds: [OTHER, BLOCK],
      hiddenTypes: ["p", "h"],
    };
    const equivalent = {
      ...presetFilters(previous),
      excludeIds: [BLOCK, OTHER, BLOCK],
      hiddenTypes: ["h", "p", "d"],
    };
    expect(applyPresetFilters(previous, equivalent)).toBe(previous);
    const mentions = applyPresetFilters(previous, { ...equivalent, mentions: "selected" });
    expect(mentions).not.toBe(previous);
    expect(mentions).toMatchObject({ mentions: "selected", query: "keep my search" });
    expect(mentions.excludeIds).toBe(previous.excludeIds);
    expect(mentions.hiddenTypes).toBe(previous.hiddenTypes);
    expect(mentions.excludedMentionPhrases).toBe(previous.excludedMentionPhrases);
    const phrases = applyPresetFilters(previous, { ...equivalent, excludedMentionPhrases: ["01"] });
    expect(phrases.excludedMentionPhrases).toEqual(["01"]);
    expect(phrases.excludeIds).toBe(previous.excludeIds);
    expect(phrases.hiddenTypes).toBe(previous.hiddenTypes);
    const excluded = applyPresetFilters(previous, { ...equivalent, excludeIds: [BLOCK] });
    expect(excluded.excludeIds).toEqual([BLOCK]);
    expect(excluded.excludeIds).not.toBe(previous.excludeIds);
    expect(excluded.hiddenTypes).toBe(previous.hiddenTypes);
    equivalent.excludeIds.push("20260912000002-block03");
    expect(excluded.excludeIds).toEqual([BLOCK]);
    expect(previous.excludeIds).toEqual([OTHER, BLOCK]);
  });

  it.each([
    null,
    [],
    {},
    { version: 3, presets: [], activePresetId: null },
    { ...createPresetStore(), activePresetId: "missing" },
    {
      ...createPresetStore(),
      presets: [createPresetStore().presets[0], createPresetStore().presets[0]],
    },
    {
      ...createPresetStore(),
      presets: Array.from({ length: 51 }, (_, index) => ({
        ...createPresetStore().presets[0],
        id: `preset-${index}`,
      })),
    },
  ])("rejects unsupported or structurally corrupt stores without replacement: %j", (value) => {
    expect(readPresetStore(value)).toBeNull();
  });

  it.each([
    ["notebook", "missing-id"],
    ["scopeId", null],
    ["references", "true"],
    ["hierarchy", undefined],
    ["documentsOnly", undefined],
    ["documentsOnly", 1],
    ["mentions", "unknown"],
    ["excludeIds", [BLOCK, "invalid"]],
    ["excludeIds", Array(2001).fill(BLOCK)],
    ["hiddenTypes", [false]],
    ["hiddenTypes", ["future\u0081type"]],
    ["hiddenTypes", ["a".repeat(65)]],
    ["hiddenTypes", Array(257).fill("p")],
    ["excludedMentionPhrases", null],
    ["excludedMentionPhrases", "01"],
    ["excludedMentionPhrases", [false]],
    ["excludedMentionPhrases", ["a".repeat(257)]],
    ["excludedMentionPhrases", ["bad\u0081phrase"]],
    ["excludedMentionPhrases", Array(2001).fill("01")],
    ["excludedMentionPatterns", null],
    ["excludedMentionPatterns", "^\\d{2}$"],
    ["excludedMentionPatterns", ["["]],
    ["excludedMentionPatterns", ["a".repeat(257)]],
    ["excludedMentionPatterns", Array(129).fill("a")],
    ["exclusionRules", null],
    ["exclusionRules", [{ kind: "regex", value: "[", scope: "document" }]],
    ["exclusionRules", [{ kind: "text", value: "title", scope: "unknown" }]],
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
