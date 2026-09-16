import { describe, expect, it, vi } from "vitest";
import { SourceStore, type GraphSource } from "./source-store";
import type { GraphDataset } from "../../core/graph/types";
import type { SourceProgress } from "../../core/diagnostics/progress";

function dataset(loadedAt: string): GraphDataset {
  return {
    nodes: [],
    edges: [],
    notebooks: [],
    source: "siyuan",
    loadedAt,
    loadMs: 0,
    referenceCount: 0,
    skippedReferences: 0,
    warnings: [],
  };
}
function scheduling() {
  const callbacks = new Map<number, () => void>();
  let next = 0;
  return {
    delay(callback: () => void) {
      callbacks.set(++next, callback);
      return next;
    },
    cancel(id: number) {
      callbacks.delete(id);
    },
    flush() {
      const queued = [...callbacks.values()];
      callbacks.clear();
      queued.forEach((callback) => callback());
    },
    get count() {
      return callbacks.size;
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("workspace source ownership", () => {
  it("coalesces parallel view refreshes and survives one view unsubscribing", async () => {
    const read = deferred<GraphDataset>();
    const reader = vi.fn(() => read.promise);
    const store = new SourceStore(reader, scheduling());
    const firstView = vi.fn(),
      secondView = vi.fn();
    const detach = store.subscribe(firstView);
    store.subscribe(secondView);
    const first = store.refresh(),
      second = store.refresh();
    expect(first).toBe(second);
    detach();
    const previousNotifications = firstView.mock.calls.length;
    const next = dataset("new");
    read.resolve(next);
    expect(await first).toBe(next);
    expect(reader).toHaveBeenCalledOnce();
    expect(firstView).toHaveBeenCalledTimes(previousNotifications);
    expect(secondView).toHaveBeenCalled();
    expect(store.dataRef.current).toBe(next);
    expect(store.getSnapshot()).toMatchObject({ data: next, revision: 1, refreshing: false });
    store.dispose();
  });

  it("retains the ready source on failure and publishes the next success coherently", async () => {
    const first = dataset("first"),
      next = dataset("next");
    const failure = new Error("source unavailable");
    const reader = vi
      .fn<GraphSource>()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(next);
    const store = new SourceStore(reader, scheduling());
    await store.refresh();
    await store.refresh();
    expect(store.getSnapshot()).toMatchObject({
      data: first,
      revision: 1,
      error: failure,
      refreshing: false,
    });
    await store.refresh();
    expect(store.getSnapshot()).toMatchObject({ data: next, revision: 2, error: null });
    store.dispose();
  });

  it("discards late progress after completion and after a later refresh", async () => {
    const reports: Array<(progress: SourceProgress) => void> = [];
    const reader: GraphSource = async (_signal, report) => {
      reports.push(report);
      return dataset(String(reports.length));
    };
    const store = new SourceStore(reader, scheduling());
    await store.refresh();
    const ready = store.getSnapshot();
    reports[0]({ phase: "blocks", completed: 99, total: 100 });
    expect(store.getSnapshot()).toBe(ready);
    const next = store.refresh();
    reports[0]({ phase: "notebooks" });
    expect(store.getSnapshot().progress).toEqual({ phase: "preparing" });
    await next;
    store.dispose();
  });

  it("coalesces source events during acquisition into one subsequent read", async () => {
    const read = deferred<GraphDataset>();
    const schedule = scheduling();
    const reader = vi
      .fn<GraphSource>()
      .mockImplementationOnce(() => read.promise)
      .mockResolvedValue(dataset("latest"));
    const store = new SourceStore(reader, schedule);
    const pending = store.refresh();
    store.sourceChanged(1);
    store.sourceChanged(2);
    read.resolve(dataset("first"));
    await pending;
    expect(schedule.count).toBe(1);
    schedule.flush();
    await store.refresh();
    expect(reader).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toMatchObject({ revision: 2, data: { loadedAt: "latest" } });
    store.dispose();
  });

  it("aborts application-owned work and never publishes after application disposal", async () => {
    const read = deferred<GraphDataset>();
    let signal: AbortSignal | undefined;
    const store = new SourceStore((input) => {
      signal = input;
      return read.promise;
    }, scheduling());
    const listener = vi.fn();
    store.subscribe(listener);
    const pending = store.refresh();
    await Promise.resolve();
    store.dispose();
    const notifications = listener.mock.calls.length;
    expect(signal?.aborted).toBe(true);
    read.resolve(dataset("obsolete"));
    await pending;
    expect(store.getSnapshot().data).toBeNull();
    expect(listener).toHaveBeenCalledTimes(notifications);
  });
});
