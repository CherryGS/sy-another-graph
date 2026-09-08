import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, type GraphDataset } from "./types";
import {
  filterGraph,
  newSavedView,
  readSavedViews,
  type SavedView,
} from "./views";

const saved: SavedView = {
  id: "view-one",
  name: "Saved perspective",
  createdAt: "2026-09-08T00:00:00.000Z",
  source: "siyuan",
  selectedId: null,
  filters: { ...DEFAULT_FILTERS },
};

const storage = (value: unknown) => ({ getItem: () => JSON.stringify(value) });

describe("saved view recovery", () => {
  it("recovers safely when the browser storage getter itself is blocked", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    });
    try {
      expect(readSavedViews()).toEqual([]);
    } finally {
      if (descriptor)
        Object.defineProperty(globalThis, "localStorage", descriptor);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  it("recovers safely when reading a storage item throws", () => {
    expect(
      readSavedViews({
        getItem() {
          throw new Error("Storage unavailable");
        },
      }),
    ).toEqual([]);
  });

  it("rejects malformed dataset keys and filter values without losing valid entries", () => {
    expect(
      readSavedViews(
        storage([
          null,
          5,
          "view",
          { ...saved, datasetKey: "1000000000" },
          { ...saved, datasetKey: 10000 },
          { ...saved, filters: { ...DEFAULT_FILTERS, references: "true" } },
          saved,
        ]),
      ),
    ).toEqual([saved]);
  });

  it("rejects dataset identities that contradict the source shown on the saved card", () => {
    expect(
      readSavedViews(
        storage([
          { ...saved, source: "siyuan", datasetKey: "100000" },
          { ...saved, source: "demo", datasetKey: "siyuan" },
        ]),
      ),
    ).toEqual([]);
  });

  it("migrates legitimate SiYuan views and strips obsolete dataset metadata", () => {
    const views = [saved, { ...saved, id: "previous-schema", datasetKey: "siyuan" }];
    expect(readSavedViews(storage(views))).toEqual([
      saved,
      { ...saved, id: "previous-schema" },
    ]);
    expect(readSavedViews(storage(views)).every(view => !("datasetKey" in view))).toBe(true);
  });

  it("rejects all old synthetic views without silently converting them to workspace views", () => {
    const views = [
      { ...saved, id: "small", source: "demo", datasetKey: "10000" },
      { ...saved, id: "large", source: "demo", datasetKey: "100000" },
      { ...saved, id: "legacy", source: "demo" },
      saved,
    ];
    expect(readSavedViews(storage(views))).toEqual([saved]);
  });

  it("does not accept corrupt persisted state", () => {
    expect(readSavedViews({ getItem: () => "{broken" })).toEqual([]);
    expect(
      readSavedViews({ getItem: () => '[{"id":"x","name":"x","filters":{}}]' }),
    ).toEqual([]);
  });

  it("captures independent filter values when a view is created", () => {
    const filters = {
      ...DEFAULT_FILTERS,
      notebook: "notebook-a",
      references: false,
    };
    const view = newSavedView(
      "  Saved scope  ",
      filters,
      "node-2",
    );
    filters.notebook = "notebook-b";
    filters.references = true;
    expect(view.name).toBe("Saved scope");
    expect(view.filters).toEqual({
      ...DEFAULT_FILTERS,
      notebook: "notebook-a",
      references: false,
    });
    expect(view.selectedId).toBe("node-2");
    expect(view.source).toBe("siyuan");
    expect("datasetKey" in view).toBe(false);
  });
});

const graph: GraphDataset = {
  nodes: [2, 7, 11, 31].map((index) => ({
    id: `node-${index}`,
    index,
    label: `Node ${index}`,
    notebook: index === 31 ? "b" : "a",
    path: "",
    color: "#ffffff",
    degree: 5,
  })),
  edges: [
    { source: 2, target: 7, kind: "reference", weight: 1 },
    { source: 7, target: 11, kind: "hierarchy", weight: 1 },
    { source: 11, target: 31, kind: "reference", weight: 1 },
  ],
  notebooks: [
    { id: "a", name: "A", color: "#ffffff" },
    { id: "b", name: "B", color: "#ffffff" },
  ],
  source: "siyuan",
  loadedAt: "",
  loadMs: 0,
  referenceCount: 2,
  skippedReferences: 0,
  warnings: [],
};

describe("visible graph isolation", () => {
  it("computes isolated nodes after relation filtering without renumbering stable indices", () => {
    const view = filterGraph(graph, {
      ...DEFAULT_FILTERS,
      references: false,
      hideIsolated: true,
    });
    expect(view.nodes.map((node) => node.index)).toEqual([7, 11]);
    expect(view.edges).toEqual([
      { source: 7, target: 11, kind: "hierarchy", weight: 1 },
    ]);
    expect(graph.nodes.every((node) => node.degree === 5)).toBe(true);
  });

  it("does not count a connection whose other endpoint is outside the notebook", () => {
    const view = filterGraph(graph, {
      ...DEFAULT_FILTERS,
      notebook: "b",
      hideIsolated: true,
    });
    expect(view.nodes).toEqual([]);
    expect(view.edges).toEqual([]);
  });

  it("applies isolation to the focused subgraph and handles all relations disabled", () => {
    const focused = filterGraph(
      graph,
      { ...DEFAULT_FILTERS, hideIsolated: true },
      new Set([2, 11]),
    );
    expect(focused).toEqual({ nodes: [], edges: [] });
    const noRelations = filterGraph(graph, {
      ...DEFAULT_FILTERS,
      references: false,
      hierarchy: false,
      hideIsolated: true,
    });
    expect(noRelations).toEqual({ nodes: [], edges: [] });
  });
});
