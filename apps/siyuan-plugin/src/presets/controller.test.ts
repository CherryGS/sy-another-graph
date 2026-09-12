import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS, type GraphFilters } from "../data/types";
import { PresetController, initialPresetSnapshot, type PresetSnapshot } from "./controller";
import { createPresetStore, presetFilters, samePresetFilters, type PresetFilters, type PresetStore } from "./model";

const BOOK = "20260912000000-book001";
const BLOCK = "20260912000001-block01";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function saved() {
  const store = createPresetStore();
  store.presets.push({ id: "reading", name: "Reading", filters: { ...presetFilters(DEFAULT_FILTERS), hierarchy: true, documentsOnly: false, scopeId: BLOCK, notebook: BOOK } });
  return store;
}

function harness(initial: PresetStore | null = saved(), ready = true) {
  let disk = initial;
  let filters = { ...DEFAULT_FILTERS, excludeIds: [], hiddenTypes: [] } as GraphFilters;
  let revision = 0;
  let sourceReady = ready;
  let snapshot: PresetSnapshot = initialPresetSnapshot();
  const edit = (patch: Partial<GraphFilters>) => {
    const next = { ...filters, ...patch };
    if (!samePresetFilters(filters, next)) revision++;
    filters = next;
  };
  const apply = vi.fn((rules: PresetFilters) => edit(presetFilters(rules)));
  const validate = vi.fn((rules: PresetFilters) => {
    if (!sourceReady) return "source unavailable; ";
    if (rules.notebook && rules.notebook !== BOOK) return "notebook unavailable; ";
    if (rules.scopeId && rules.scopeId !== BLOCK) return "scope unavailable; ";
    return "";
  });
  const port = {
    load: vi.fn(async (): Promise<PresetStore | null> => structuredClone(disk)),
    save: vi.fn(async (store: PresetStore): Promise<PresetStore | null> => { disk = structuredClone(store); return structuredClone(store); }),
    dispose: vi.fn(),
  };
  const publish = vi.fn((next: PresetSnapshot) => { snapshot = next; });
  const controller = new PresetController(port, {
    getFilters: () => filters, applyFilters: apply, ruleRevision: () => revision,
    sourceReady: () => sourceReady, validate,
  }, publish);
  return {
    controller, port, publish, apply, validate, edit,
    get filters() { return filters; }, get snapshot() { return snapshot; }, get disk() { return disk; },
    setDisk(value: PresetStore | null) { disk = value; },
    ready() { sourceReady = true; controller.hydrate(); },
  };
}

describe("preset persistence and drafts", () => {
  it("keeps drafts separate through update, copying the saved baseline, conservative creation, and save-as", async () => {
    const h = harness(null);
    await h.controller.load(true);
    expect(h.snapshot.store.presets).toHaveLength(1);
    expect(h.port.save).not.toHaveBeenCalled();
    h.edit({ query: "keep search", hierarchy: true, documentsOnly: false, hiddenTypes: ["p"] });
    expect(h.disk).toBeNull();
    expect(samePresetFilters(h.filters, h.snapshot.store.presets[0].filters)).toBe(false);
    expect(await h.controller.update()).toBe(true);
    expect(samePresetFilters(h.filters, h.snapshot.store.presets[0].filters)).toBe(true);
    h.edit({ hierarchy: false });
    expect(await h.controller.copy("documents", "Saved baseline copy")).toBe(true);
    const copy = h.snapshot.store.presets[1];
    expect(copy.id).not.toBe("documents");
    expect(copy.filters.hierarchy).toBe(true);
    expect(h.filters.hierarchy).toBe(true);
    expect(h.filters.query).toBe("keep search");
    expect(h.snapshot.store.activePresetId).toBe(copy.id);
    expect(await h.controller.create("Fresh")).toBe(true);
    expect(h.filters).toMatchObject({ documentsOnly: true, hierarchy: false, mentions: "off", query: "keep search" });
    h.edit({ scopeId: BLOCK, references: false });
    const draft = h.filters;
    expect(await h.controller.saveAs("Current draft")).toBe(true);
    expect(h.filters).toBe(draft);
    const current = h.snapshot.store.presets.at(-1)!;
    expect(current.filters.scopeId).toBe(BLOCK);
    expect(current.filters.references).toBe(false);
    expect("query" in current.filters).toBe(false);
    expect(await h.controller.rename(current.id, "  Renamed  ")).toBe(true);
    expect(h.snapshot.store.presets.at(-1)!.name).toBe("Renamed");
    expect(h.filters).toBe(draft);
    expect(h.disk).toEqual(h.snapshot.store);
    h.controller.dispose();
  });

  it("deletes without altering current filters and undo restores position and only an unchanged active choice", async () => {
    const h = harness();
    await h.controller.load();
    await h.controller.apply("reading");
    const filters = h.filters;
    expect(await h.controller.remove("reading")).toBe(true);
    expect(h.filters).toBe(filters);
    expect(h.snapshot.store.activePresetId).toBeNull();
    expect(h.snapshot.deleted?.id).toBe("reading");
    expect(await h.controller.undoDelete()).toBe(true);
    expect(h.snapshot.store.presets.map(item => item.id)).toEqual(["documents", "reading"]);
    expect(h.snapshot.store.activePresetId).toBe("reading");
    expect(h.snapshot.deleted).toBeNull();
    await h.controller.remove("reading");
    h.edit({ hierarchy: false });
    await h.controller.undoDelete();
    expect(h.snapshot.store.activePresetId).toBeNull();
    expect(h.filters.hierarchy).toBe(false);
    expect(await h.controller.update()).toBe(false);
    expect(h.snapshot.error).toContain("另存");
    h.controller.dispose();
  });

  it("does not commit failed or uncertain saves and rereads the actual outcome before allowing more writes", async () => {
    const h = harness();
    await h.controller.load();
    const before = h.snapshot.store;
    h.edit({ hierarchy: true });
    h.port.save.mockRejectedValueOnce(new Error("disk full"));
    expect(await h.controller.update()).toBe(false);
    expect(h.snapshot).toMatchObject({ store: before, available: false, saving: false, error: "disk full" });
    expect(h.filters.hierarchy).toBe(true);
    expect(await h.controller.create("blocked")).toBe(false);
    expect(h.port.save).toHaveBeenCalledTimes(1);
    await h.controller.load();
    const draft = h.filters;
    h.port.save.mockImplementationOnce(async store => {
      h.setDisk(store);
      throw new Error("save timed out; outcome unknown");
    });
    expect(await h.controller.update()).toBe(false);
    expect(h.snapshot.store.presets[0].filters.hierarchy).toBe(false);
    expect(h.snapshot.available).toBe(false);
    await h.controller.load();
    expect(h.filters).toBe(draft);
    expect(h.snapshot.store.presets[0].filters.hierarchy).toBe(true);
    expect(h.snapshot).toMatchObject({ available: true, error: "" });
    expect(await h.controller.rename("documents", "Recovered")).toBe(true);
    h.controller.dispose();
  });

  it.each([null, { ...saved(), activePresetId: "reading" }])("rejects absent or mismatched save acknowledgements", async result => {
    const h = harness();
    await h.controller.load();
    const before = h.snapshot.store;
    h.port.save.mockResolvedValueOnce(result);
    expect(await h.controller.rename("documents", "New name")).toBe(false);
    expect(h.snapshot.store).toBe(before);
    expect(h.snapshot.available).toBe(false);
    expect(h.snapshot.error).toContain("不一致");
    h.controller.dispose();
  });

  it("guards rapid actions and suppresses late commits after disposal", async () => {
    const h = harness();
    const loading = deferred<PresetStore | null>();
    h.port.load.mockReturnValueOnce(loading.promise);
    const load = h.controller.load();
    expect(await h.controller.create("too early")).toBe(false);
    loading.resolve(saved());
    await load;
    const save = deferred<PresetStore | null>();
    h.port.save.mockReturnValueOnce(save.promise);
    const applying = h.controller.apply("reading");
    expect(h.snapshot.saving).toBe(true);
    expect(await h.controller.rename("reading", "racing")).toBe(false);
    await h.controller.load();
    expect(h.port.load).toHaveBeenCalledTimes(1);
    expect(h.port.save).toHaveBeenCalledTimes(1);
    const count = h.publish.mock.calls.length;
    h.controller.dispose();
    save.resolve(h.port.save.mock.calls[0][0]);
    expect(await applying).toBe(false);
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.publish).toHaveBeenCalledTimes(count);
    expect(h.port.dispose).toHaveBeenCalledOnce();
    expect(await h.controller.remove("documents")).toBe(false);
  });
});

describe("asynchronous preset activation", () => {
  it.each(["apply", "create", "copy"] as const)("%s preserves query-only edits while a save is pending", async action => {
    const h = harness();
    await h.controller.load();
    h.edit({ references: false });
    const saving = deferred<PresetStore | null>();
    h.port.save.mockReturnValueOnce(saving.promise);
    const pending = action === "apply" ? h.controller.apply("reading")
      : action === "copy" ? h.controller.copy("reading", "Copy") : h.controller.create("Fresh");
    h.edit({ query: "new search" });
    saving.resolve(h.port.save.mock.calls[0][0]);
    expect(await pending).toBe(true);
    expect(h.filters.query).toBe("new search");
    expect(h.filters.references).toBe(true);
    expect(h.filters.scopeId).toBe(action === "create" ? "" : BLOCK);
    h.controller.dispose();
  });

  it.each([false, true])("keeps newer explicit rules when a delayed activation completes, including reverted edits=%s", async revert => {
    const h = harness();
    await h.controller.load();
    const saving = deferred<PresetStore | null>();
    h.port.save.mockReturnValueOnce(saving.promise);
    const pending = h.controller.apply("reading");
    h.edit({ hierarchy: true });
    if (revert) h.edit({ hierarchy: false });
    const draft = h.filters;
    saving.resolve(h.port.save.mock.calls[0][0]);
    expect(await pending).toBe(true);
    expect(h.filters).toBe(draft);
    expect(h.filters.scopeId).toBe("");
    expect(h.snapshot.store.activePresetId).toBe("reading");
    expect(samePresetFilters(h.filters, h.snapshot.store.presets[1].filters)).toBe(false);
    h.controller.dispose();
  });

  it("waits for source readiness during startup and restores once while preserving search", async () => {
    const store = { ...saved(), activePresetId: "reading" };
    const h = harness(store, false);
    await h.controller.load(true);
    h.edit({ query: "initial search" });
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.validate).not.toHaveBeenCalled();
    h.ready();
    expect(h.filters).toMatchObject({ scopeId: BLOCK, notebook: BOOK, hierarchy: true, query: "initial search" });
    h.controller.hydrate();
    expect(h.apply).toHaveBeenCalledOnce();
    h.controller.dispose();
  });

  it.each(["notebook", "scopeId"] as const)("rejects stale %s for initial restoration and copy just as for manual apply", async field => {
    const store = { ...saved(), activePresetId: "reading" };
    store.presets[1].filters[field] = "20260912000002-missing";
    const h = harness(store, false);
    await h.controller.load(true);
    h.ready();
    expect(h.filters.scopeId).toBe("");
    expect(h.snapshot.error).toContain("未自动应用");
    expect(await h.controller.apply("reading")).toBe(false);
    expect(await h.controller.copy("reading", "Invalid copy")).toBe(false);
    expect(h.port.save).not.toHaveBeenCalled();
    expect(h.apply).not.toHaveBeenCalled();
    h.controller.dispose();
  });

  it.each(["pending read", "pending source"])("never restores over explicit rules while %s, even after reverting them", async stage => {
    const store = { ...saved(), activePresetId: "reading" };
    const h = harness(store, stage === "pending read");
    const reading = deferred<PresetStore | null>();
    if (stage === "pending read") h.port.load.mockReturnValueOnce(reading.promise);
    const pending = h.controller.load(true);
    if (stage === "pending source") await pending;
    h.edit({ scopeId: BLOCK });
    h.edit({ scopeId: "" });
    reading.resolve(store);
    await pending;
    h.ready();
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.filters.scopeId).toBe("");
    h.controller.dispose();
  });

  it("ignores stale reads after retry or disposal and keeps unavailable stores read-only", async () => {
    const h = harness();
    const first = deferred<PresetStore | null>();
    h.port.load.mockReturnValueOnce(first.promise);
    const old = h.controller.load(true);
    await h.controller.load();
    first.resolve({ ...saved(), activePresetId: "reading" });
    await old;
    expect(h.snapshot.store.activePresetId).toBe("documents");
    expect(h.apply).not.toHaveBeenCalled();
    h.port.load.mockRejectedValueOnce(new Error("corrupt file"));
    await h.controller.load();
    expect(h.snapshot.available).toBe(false);
    expect(await h.controller.update()).toBe(false);
    const last = deferred<PresetStore | null>();
    h.port.load.mockReturnValueOnce(last.promise);
    const closing = h.controller.load(true);
    const count = h.publish.mock.calls.length;
    h.controller.dispose();
    last.resolve(saved());
    await closing;
    expect(h.publish).toHaveBeenCalledTimes(count);
    expect(h.apply).not.toHaveBeenCalled();
  });
});
