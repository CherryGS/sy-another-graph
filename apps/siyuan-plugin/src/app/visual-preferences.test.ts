import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GRAPH_SETTINGS } from "../graph/settings";
import {
  normalizeVisualPreferences,
  readVisualPreferences,
  VISUAL_PREFERENCES_KEY,
} from "./visual-preferences";

const defaults = {
  colorBy: "type",
  pointSize: 4,
  showLabels: true,
  showLinks: true,
  graphSettings: { ...DEFAULT_GRAPH_SETTINGS },
};

describe("visual preference normalization", () => {
  it("defaults to type colors and complete settings for missing or wrong-shaped stored JSON", () => {
    for (const text of ["null", "false", "4", '"old-format"', "[]", "{}"])
      expect(normalizeVisualPreferences(JSON.parse(text))).toEqual(defaults);
    expect(normalizeVisualPreferences(undefined)).toEqual(defaults);
  });

  it("restores each supported color grouping without accepting unknown or coerced values", () => {
    for (const colorBy of ["type", "branch", "notebook", "degree"])
      expect(normalizeVisualPreferences({ colorBy }).colorBy).toBe(colorBy);
    for (const colorBy of ["Type", "random", "", null, 0, ["degree"], {}])
      expect(normalizeVisualPreferences({ colorBy }).colorBy).toBe("type");
  });

  it("clamps finite point sizes and rejects nonnumeric or nonfinite persisted sizes", () => {
    expect(normalizeVisualPreferences({ pointSize: -100 }).pointSize).toBe(1);
    expect(normalizeVisualPreferences({ pointSize: 100 }).pointSize).toBe(10);
    for (const pointSize of [1, 4.5, 10])
      expect(normalizeVisualPreferences({ pointSize }).pointSize).toBe(pointSize);
    for (const pointSize of [NaN, Infinity, -Infinity, "8", null, true, []])
      expect(normalizeVisualPreferences({ pointSize }).pointSize).toBe(4);
  });

  it("restores false toggles while refusing truthy strings and numeric booleans", () => {
    expect(normalizeVisualPreferences({ showLabels: false, showLinks: false }))
      .toMatchObject({ showLabels: false, showLinks: false });
    for (const value of ["false", "true", 0, 1, null, [], {}])
      expect(normalizeVisualPreferences({ showLabels: value, showLinks: value }))
        .toMatchObject({ showLabels: true, showLinks: true });
  });

  it("validates nested settings independently without losing valid appearance choices", () => {
    const restored = normalizeVisualPreferences(JSON.parse(`{
      "colorBy": "notebook",
      "pointSize": 7.5,
      "showLinks": false,
      "graphSettings": {
        "dimensions": "3",
        "labelDensity": "unlimited",
        "linkWidth": 100,
        "linkOpacity": -1,
        "gravity": "0.5",
        "repulsion": null,
        "showArrows": "false",
        "curvedLinks": false,
        "simulationSpaceSize": 1000000
      }
    }`));
    expect(restored).toMatchObject({
      colorBy: "notebook",
      pointSize: 7.5,
      showLabels: true,
      showLinks: false,
      graphSettings: {
        dimensions: 2,
        labelDensity: "dense",
        linkWidth: 4,
        linkOpacity: 0.05,
        gravity: DEFAULT_GRAPH_SETTINGS.gravity,
        repulsion: DEFAULT_GRAPH_SETTINGS.repulsion,
        showArrows: true,
        curvedLinks: false,
      },
    });
    expect(restored.graphSettings).not.toHaveProperty("simulationSpaceSize");
    for (const graphSettings of [null, [], true, 3, "legacy"])
      expect(normalizeVisualPreferences({ graphSettings }).graphSettings)
        .toEqual(DEFAULT_GRAPH_SETTINGS);
  });

  it("preserves a valid serialized preference snapshot while dropping unrelated persisted keys", () => {
    const saved = {
      colorBy: "degree",
      pointSize: 6.5,
      showLabels: false,
      showLinks: true,
      graphSettings: {
        ...DEFAULT_GRAPH_SETTINGS,
        dimensions: 3,
        labelDensity: "high",
        linkWidth: 2.5,
        linkOpacity: 0.4,
        repulsion: 2,
        sphereShading: false,
      },
    };
    const text = JSON.stringify({ ...saved, chosenIds: ["old-node"], paused: true });
    const restored = normalizeVisualPreferences(JSON.parse(text));
    expect(restored).toEqual(saved);
    expect(restored).not.toHaveProperty("chosenIds");
    expect(restored).not.toHaveProperty("paused");
    expect(normalizeVisualPreferences(JSON.parse(JSON.stringify(restored))))
      .toEqual(restored);
  });

  it("recovers numeric nulls produced by JSON serialization without discarding valid neighbors", () => {
    const text = JSON.stringify({
      pointSize: Infinity,
      graphSettings: { dimensions: 3, gravity: NaN, linkDistance: 42 },
    });
    expect(normalizeVisualPreferences(JSON.parse(text))).toMatchObject({
      pointSize: 4,
      graphSettings: {
        dimensions: 3,
        gravity: DEFAULT_GRAPH_SETTINGS.gravity,
        linkDistance: 42,
      },
    });
  });

  it("does not mutate stored objects or share a mutable default settings result", () => {
    const graphSettings = Object.freeze({ dimensions: 3, gravity: 10 });
    const stored = Object.freeze({ pointSize: 100, graphSettings });
    const restored = normalizeVisualPreferences(stored);
    expect(restored.pointSize).toBe(10);
    expect(restored.graphSettings.gravity).toBe(1);
    expect(stored.pointSize).toBe(100);
    expect(stored.graphSettings.gravity).toBe(10);
    expect(restored.graphSettings).not.toBe(graphSettings);
    const first = normalizeVisualPreferences(null);
    first.graphSettings.gravity = 1;
    expect(normalizeVisualPreferences(null)).toEqual(defaults);
    expect(DEFAULT_GRAPH_SETTINGS.gravity).toBe(0.12);
  });
});

describe("versioned visual preference restoration", () => {
  const legacyKey = "sy-another-graph:appearance:v1";
  const stored = (entries: Record<string, string>) => ({
    getItem: vi.fn((key: string) => entries[key] ?? null),
  });

  it("migrates only the old default spring while preserving other saved appearance and forces", () => {
    const legacy = {
      colorBy: "notebook",
      pointSize: 7.5,
      showLabels: false,
      showLinks: false,
      graphSettings: {
        ...DEFAULT_GRAPH_SETTINGS,
        dimensions: 3,
        linkSpring: 1,
        gravity: 0.2,
        decay: 12000,
        linkWidth: 2.5,
        sphereShading: false,
      },
    };
    const text = JSON.stringify(legacy);
    const storage = stored({ [legacyKey]: text });
    expect(readVisualPreferences(storage)).toEqual({
      ...legacy,
      graphSettings: { ...legacy.graphSettings, linkSpring: 0.4 },
    });
    expect(storage.getItem.mock.calls).toEqual([
      [VISUAL_PREFERENCES_KEY],
      [legacyKey],
    ]);
    expect(storage.getItem(legacyKey)).toBe(text);
  });

  it.each([0, 0.8, 2])("retains a custom legacy spring of %s", (linkSpring) => {
    const storage = stored({
      [legacyKey]: JSON.stringify({
        colorBy: "branch",
        showLinks: false,
        graphSettings: { linkSpring, gravity: 0 },
      }),
    });
    expect(readVisualPreferences(storage)).toMatchObject({
      colorBy: "branch",
      showLinks: false,
      graphSettings: { linkSpring, gravity: 0 },
    });
  });

  it("prefers a valid v2 record and preserves an explicit spring of one", () => {
    const storage = stored({
      [legacyKey]: JSON.stringify({ colorBy: "branch", graphSettings: { linkSpring: 1 } }),
      [VISUAL_PREFERENCES_KEY]: JSON.stringify({
        colorBy: "degree",
        pointSize: 9,
        showLabels: false,
        graphSettings: { linkSpring: 1, decay: 8000 },
      }),
    });
    expect(readVisualPreferences(storage)).toMatchObject({
      colorBy: "degree",
      pointSize: 9,
      showLabels: false,
      graphSettings: { linkSpring: 1, decay: 8000 },
    });
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(VISUAL_PREFERENCES_KEY);
  });

  it("does not repeat the legacy migration after the user saves a new spring of one", () => {
    const entries: Record<string, string> = {
      [legacyKey]: JSON.stringify({ colorBy: "branch", graphSettings: { linkSpring: 1 } }),
    };
    const storage = stored(entries);
    const migrated = readVisualPreferences(storage);
    expect(migrated.graphSettings.linkSpring).toBe(0.4);
    entries[VISUAL_PREFERENCES_KEY] = JSON.stringify(migrated);
    const changed = {
      ...readVisualPreferences(storage),
      graphSettings: { ...migrated.graphSettings, linkSpring: 1 },
    };
    entries[VISUAL_PREFERENCES_KEY] = JSON.stringify(changed);
    expect(readVisualPreferences(storage)).toEqual(changed);
    expect(JSON.parse(entries[legacyKey]).graphSettings.linkSpring).toBe(1);
  });

  it.each(["{broken", "null", "[]", "false", '"old-format"'])
    ("recovers a valid legacy record when v2 contains %s", (invalid) => {
      const storage = stored({
        [VISUAL_PREFERENCES_KEY]: invalid,
        [legacyKey]: JSON.stringify({
          colorBy: "notebook",
          showLinks: false,
          graphSettings: { linkSpring: 1, repulsion: 1.5 },
        }),
      });
      expect(readVisualPreferences(storage)).toMatchObject({
        colorBy: "notebook",
        showLinks: false,
        graphSettings: { linkSpring: 0.4, repulsion: 1.5 },
      });
    });

  it("normalizes invalid v2 fields while retaining its valid values and explicit spring", () => {
    const storage = stored({
      [VISUAL_PREFERENCES_KEY]: JSON.stringify({
        colorBy: "degree",
        pointSize: "8",
        showLabels: false,
        graphSettings: { linkSpring: 1, gravity: "bad", repulsion: -1 },
      }),
      [legacyKey]: JSON.stringify({ colorBy: "branch", pointSize: 8 }),
    });
    expect(readVisualPreferences(storage)).toMatchObject({
      colorBy: "degree",
      pointSize: 4,
      showLabels: false,
      graphSettings: { linkSpring: 1, gravity: 0.12, repulsion: 0 },
    });
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(VISUAL_PREFERENCES_KEY);
  });

  it("restores defaults when neither version is usable or storage reads are blocked", () => {
    expect(readVisualPreferences(stored({}))).toEqual(defaults);
    expect(readVisualPreferences(stored({
      [VISUAL_PREFERENCES_KEY]: "{broken",
      [legacyKey]: "[broken",
    }))).toEqual(defaults);
    expect(readVisualPreferences({
      getItem() { throw new Error("Storage access blocked"); },
    })).toEqual(defaults);
  });

  it("can still recover legacy preferences if only the v2 read fails", () => {
    const storage = {
      getItem(key: string) {
        if (key === VISUAL_PREFERENCES_KEY) throw new Error("Unreadable v2");
        return JSON.stringify({ pointSize: 6, graphSettings: { linkSpring: 0.8 } });
      },
    };
    expect(readVisualPreferences(storage)).toMatchObject({
      pointSize: 6,
      graphSettings: { linkSpring: 0.8 },
    });
  });
});
