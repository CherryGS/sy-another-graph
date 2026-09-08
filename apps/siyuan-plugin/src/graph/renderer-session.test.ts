import { describe, expect, it, vi } from "vitest";
import type { CosmographConfig } from "@cosmograph/cosmograph";
import type { PreparedGraph } from "./prepare-graph";
import type { UploadedGraph } from "./graph-tables";
import { RendererSession, type FrameScheduler } from "./renderer-session";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function data(id = "a", linksCount = 1): PreparedGraph {
  return {
    config: {},
    indexToId: [id, "b"],
    indexToLabel: [id, "b"],
    idToIndex: new Map([
      [id, 0],
      ["b", 1],
    ]),
    pointsCount: 2,
    linksCount,
    preparationMs: 0,
  };
}

function harness() {
  const order: string[] = [];
  const records = new Map<string, PreparedGraph>();
  const configurations: CosmographConfig[] = [];
  const timers = new Map<number, () => void>();
  const frames = new Map<number, () => void>();
  let sequence = 0;
  const scheduler: FrameScheduler = {
    delay(callback) {
      const id = ++sequence;
      timers.set(id, callback);
      return id;
    },
    cancelDelay(id) {
      timers.delete(id);
    },
    frame(callback) {
      const id = ++sequence;
      frames.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
  };
  const graph = {
    stats: { pointsCount: 0, linksCount: 0 },
    setConfig: vi.fn(async (config: CosmographConfig) => {
      configurations.push(config);
      const prepared = records.get(String(config.points));
      graph.stats = {
        pointsCount: prepared?.pointsCount ?? 0,
        linksCount: prepared?.linksCount ?? 0,
      };
      order.push("configured");
    }),
    reset: vi.fn(async () => {
      graph.stats = { pointsCount: 0, linksCount: 0 };
      order.push("reset");
    }),
    destroy: vi.fn(async () => {
      order.push("destroy");
    }),
    pause: vi.fn(),
    unpause: vi.fn(),
    selectPoints: vi.fn(),
    setFocusedPoint: vi.fn(),
    fitView: vi.fn(),
    getZoomLevel: vi.fn(() => 2.5),
    setZoomLevel: vi.fn(),
  };
  const tables = {
    active: null as UploadedGraph | null,
    stage: vi.fn(async (prepared: PreparedGraph): Promise<UploadedGraph> => {
      if (tables.active?.prepared === prepared) return tables.active;
      const points = `points_${records.size}`;
      records.set(points, prepared);
      return { prepared, points, links: `${points}_links` };
    }),
    commit: vi.fn(async (uploaded: UploadedGraph) => {
      tables.active = uploaded;
      order.push("commit");
    }),
    discard: vi.fn(async () => {
      order.push("discard");
    }),
    clear: vi.fn(async () => {
      tables.active = null;
      order.push("clear");
    }),
  };
  const drain = vi.fn(async () => {
    order.push("drain");
  });
  const close = vi.fn(async () => {
    order.push("close");
  });
  const failure = vi.fn();
  const session = new RendererSession(
    graph,
    tables,
    drain,
    close,
    failure,
    scheduler,
  );
  return {
    session,
    graph,
    tables,
    order,
    close,
    failure,
    timers,
    frames,
    configurations,
    records,
  };
}

describe("renderer lifetime", () => {
  it("waits for an in-flight rebuild before destroying GPU, tables, and database", async () => {
    const h = harness();
    await h.session.update(data(), {});
    h.graph.selectPoints.mockClear();
    h.graph.pause.mockClear();
    h.graph.unpause.mockClear();
    const started = deferred();
    const finish = deferred();
    h.graph.setConfig.mockImplementationOnce(async () => {
      started.resolve();
      await finish.promise;
      h.order.push("rebuild-finished");
    });
    const update = h.session.update(data("c"), {});
    await started.promise;
    h.session.controls("b", true);
    h.session.fit();
    expect(h.graph.pause).not.toHaveBeenCalled();
    expect(h.graph.selectPoints).not.toHaveBeenCalled();
    expect(h.graph.fitView).not.toHaveBeenCalled();
    const closing = h.session.dispose();
    expect(h.graph.destroy).not.toHaveBeenCalled();
    finish.resolve();
    expect(await update).toBeNull();
    await closing;
    expect(h.order.indexOf("rebuild-finished")).toBeLessThan(
      h.order.indexOf("destroy"),
    );
    expect(h.order.indexOf("destroy")).toBeLessThan(h.order.indexOf("clear"));
    expect(h.order.indexOf("clear")).toBeLessThan(h.order.indexOf("close"));
    h.session.controls("a", false);
    h.session.fit();
    expect(h.graph.selectPoints).not.toHaveBeenCalled();
    expect(h.close).toHaveBeenCalledTimes(1);
    await h.session.dispose();
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it("skips superseded queued configurations and rejects stale label callbacks", async () => {
    const h = harness();
    const started = deferred();
    const finish = deferred();
    const setConfig = h.graph.setConfig.getMockImplementation()!;
    h.graph.setConfig.mockImplementationOnce(async (config) => {
      started.resolve();
      await finish.promise;
      await setConfig(config);
    });
    const clicked = vi.fn();
    const first = h.session.update(data("old"), { onLabelClick: clicked });
    await started.promise;
    const middle = h.session.update(data("skipped"), { onLabelClick: clicked });
    const last = h.session.update(data("new"), { onLabelClick: clicked });
    finish.resolve();
    expect(await first).toBeNull();
    expect(await middle).toBeNull();
    expect(await last).toMatchObject({ pointsCount: 2, linksCount: 1 });
    expect(h.graph.setConfig).toHaveBeenCalledTimes(2);
    h.configurations[0].onLabelClick?.(0, "old", {} as MouseEvent);
    expect(clicked).not.toHaveBeenCalled();
    h.configurations[1].onLabelClick?.(0, "new", {} as MouseEvent);
    expect(clicked).toHaveBeenCalledWith(0, "new", {});
    await h.session.dispose();
  });

  it("cancels fit timers and frames and guards a callback already dequeued by the browser", async () => {
    const h = harness();
    await h.session.update(data(), {});
    const timer = h.timers.values().next().value!;
    timer();
    const frame = h.frames.values().next().value!;
    h.session.suspend();
    expect(h.frames.size).toBe(0);
    frame();
    expect(h.graph.fitView).not.toHaveBeenCalled();
    await h.session.dispose();
    timer();
    frame();
    expect(h.graph.fitView).not.toHaveBeenCalled();
  });

  it("applies only the latest requested controls after a rebuild completes", async () => {
    const h = harness();
    const started = deferred();
    const finish = deferred();
    const setConfig = h.graph.setConfig.getMockImplementation()!;
    h.graph.setConfig.mockImplementationOnce(async (config) => {
      started.resolve();
      await finish.promise;
      await setConfig(config);
    });
    const pending = h.session.update(data(), {});
    await started.promise;
    h.session.controls("a", false);
    h.session.controls("b", true);
    finish.resolve();
    await pending;
    expect(h.graph.selectPoints).toHaveBeenCalledExactlyOnceWith(
      [1],
      false,
      true,
    );
    expect(h.graph.pause).toHaveBeenCalledTimes(1);
    expect(h.graph.unpause).not.toHaveBeenCalled();
    await h.session.dispose();
  });

  it("reports a live rebuild failure rather than treating it as cancellation", async () => {
    const h = harness();
    const failure = new Error("GPU upload failed");
    h.graph.setConfig.mockImplementationOnce(async (config) => {
      config.onGraphRebuildError?.(failure);
    });
    await expect(h.session.update(data(), {})).rejects.toBe(failure);
    expect(h.session.isInteractive).toBe(false);
    h.session.fit();
    h.session.controls("a", false);
    expect(h.graph.fitView).not.toHaveBeenCalled();
    expect(h.graph.selectPoints).not.toHaveBeenCalled();
    await h.session.dispose();
  });

  it("retains a defined links table through linked, zero-link, and linked updates", async () => {
    const h = harness();
    await h.session.update(data("one", 1), {});
    await h.session.update(data("two", 0), {});
    await h.session.update(data("three", 2), {});
    expect(
      h.configurations.every((config) => typeof config.links === "string"),
    ).toBe(true);
    expect(
      h.configurations.every((config) => config.fitViewOnInit === false),
    ).toBe(true);
    expect(h.session.counts).toEqual({ nodes: 2, links: 2 });
    await h.session.dispose();
  });

  it("resumes a settled paused graph at its existing zoom without touching data, configuration, or selection", async () => {
    const h = harness();
    h.session.controls("a", true, ["a", "b"]);
    const prepared = data();
    await h.session.update(prepared, {});
    h.timers.values().next().value!();
    h.frames.values().next().value!();
    h.graph.fitView.mockClear();
    h.graph.setConfig.mockClear();
    h.tables.stage.mockClear();
    h.graph.selectPoints.mockClear();
    h.frames.clear();
    const diagnostics = h.session.getDiagnostics();

    h.session.setActive(false);
    expect(h.session.isInteractive).toBe(false);
    expect(h.session.displayed).toBe(prepared);
    h.session.setActive(true);
    expect(h.session.isInteractive).toBe(true);
    h.frames.values().next().value!();
    expect(h.graph.setZoomLevel).toHaveBeenCalledExactlyOnceWith(2.5, 0);
    expect(h.graph.unpause).not.toHaveBeenCalled();
    expect(h.graph.fitView).not.toHaveBeenCalled();
    expect(h.graph.selectPoints).not.toHaveBeenCalled();
    expect(h.graph.setConfig).not.toHaveBeenCalled();
    expect(h.tables.stage).not.toHaveBeenCalled();
    expect(h.session.getDiagnostics()).toEqual(diagnostics);
    await h.session.dispose();
  });

  it("defers hidden controls and initial fitting, then discards stale visibility frames", async () => {
    const h = harness();
    h.session.setActive(false);
    await h.session.update(data(), {});
    h.session.controls("b", false, ["a", "b"]);
    expect(h.graph.pause).toHaveBeenCalled();
    expect(h.graph.unpause).not.toHaveBeenCalled();
    expect(h.graph.selectPoints).not.toHaveBeenCalled();
    expect(h.timers.size).toBe(0);
    h.session.setActive(true);
    expect(h.graph.selectPoints).toHaveBeenCalledExactlyOnceWith(
      [1, 0],
      false,
      true,
    );
    expect(h.graph.setFocusedPoint).toHaveBeenCalledExactlyOnceWith(1);
    expect(h.graph.unpause).toHaveBeenCalledTimes(1);
    const staleRefresh = h.frames.values().next().value!;
    h.session.setActive(false);
    expect(h.frames.size).toBe(0);
    h.session.setActive(true);
    staleRefresh();
    expect(h.graph.setZoomLevel).not.toHaveBeenCalled();
    const refresh = h.frames.values().next().value!;
    refresh();
    expect(h.graph.setZoomLevel).toHaveBeenCalledTimes(1);
    expect(h.timers.size).toBe(1);
    await h.session.dispose();
    refresh();
    expect(h.graph.setZoomLevel).toHaveBeenCalledTimes(1);
  });

  it("does not execute a fit frame dequeued before a hide/show cycle", async () => {
    const h = harness();
    await h.session.update(data(), {});
    h.timers.values().next().value!();
    const staleFit = h.frames.values().next().value!;
    h.session.setActive(false);
    h.session.setActive(true);
    staleFit();
    expect(h.graph.fitView).not.toHaveBeenCalled();
    expect(h.frames.size).toBe(1);
    await h.session.dispose();
    expect(h.frames.size).toBe(0);
  });

  it("maps a whole requested neighborhood to current dense indices and distinguishes its root", async () => {
    const h = harness();
    const prepared = data();
    prepared.idToIndex.set("c", 2);
    prepared.indexToId.push("c");
    prepared.indexToLabel.push("c");
    prepared.pointsCount = 3;
    h.session.controls("b", false, ["a", "b", "c", "outside", "c"]);
    await h.session.update(prepared, {});
    expect(h.graph.selectPoints).toHaveBeenLastCalledWith(
      [1, 0, 2],
      false,
      true,
    );
    expect(h.graph.setFocusedPoint).toHaveBeenLastCalledWith(1);
    const calls = h.graph.selectPoints.mock.calls.length;
    h.session.controls("b", false, ["a", "b", "c", "outside", "c"]);
    h.session.controls("b", true, ["a", "b", "c", "outside", "c"]);
    expect(h.graph.selectPoints).toHaveBeenCalledTimes(calls);
    h.session.controls(null, true, []);
    expect(h.graph.selectPoints).toHaveBeenLastCalledWith(null, false, true);
    expect(h.graph.setFocusedPoint).toHaveBeenLastCalledWith(undefined);
    await h.session.dispose();
  });

  it("lets visual configuration choose a prepared color column without replacing the prepared graph", async () => {
    const h = harness();
    const prepared = data();
    prepared.config.pointColorBy = "branchColor";
    await h.session.update(prepared, { pointColorBy: "degreeColor" });
    const uploaded = h.tables.active;
    await h.session.update(prepared, { pointColorBy: "color" });
    expect(h.tables.active).toBe(uploaded);
    expect(h.configurations.map((config) => config.pointColorBy)).toEqual([
      "degreeColor",
      "color",
    ]);
    await h.session.dispose();
  });

  it("reports actual configuration completions and resolved highlights independently of requested controls", async () => {
    const h = harness();
    const notified = vi.fn();
    const unsubscribe = h.session.subscribe(notified);
    const identity = h.session.getDiagnostics().sessionId;
    expect(harness().session.getDiagnostics().sessionId).not.toBe(identity);
    await h.session.initialize({});
    const prepared = data();
    h.session.controls("b", false, ["a", "b", "outside"]);
    await h.session.update(prepared, {});
    expect(h.session.getDiagnostics()).toMatchObject({
      sessionId: identity,
      configurations: 2,
      dataRevisions: 1,
      requestedHighlightCount: 2,
      highlightedCount: 0,
      selectedRootId: "b",
    });
    h.configurations.at(-1)!.onPointsFiltered?.({} as never, [0, 1], [0]);
    expect(h.session.getDiagnostics().highlightedCount).toBe(2);
    expect(notified).toHaveBeenCalled();
    unsubscribe();
    notified.mockClear();
    await h.session.update(prepared, { pointColorBy: "color" });
    expect(h.session.getDiagnostics()).toMatchObject({
      configurations: 3,
      dataRevisions: 1,
    });
    expect(notified).not.toHaveBeenCalled();
    const failure = new Error("failed configuration");
    h.graph.setConfig.mockRejectedValueOnce(failure);
    await expect(h.session.update(data("next"), {})).rejects.toBe(failure);
    expect(h.session.getDiagnostics()).toMatchObject({
      configurations: 3,
      dataRevisions: 1,
    });
    await h.session.dispose();
  });

  it("counts completed point drags with movement but ignores clicks and obsolete callbacks", async () => {
    const h = harness();
    await h.session.update(data(), {});
    const config = h.configurations[0];
    const event = { dx: 12, dy: -4 } as Parameters<
      NonNullable<CosmographConfig["onDrag"]>
    >[0];
    config.onDragStart?.(event);
    config.onDragEnd?.(event);
    expect(h.session.getDiagnostics().dragCount).toBe(0);
    config.onDragStart?.(event);
    config.onDrag?.(event);
    config.onDragEnd?.(event);
    expect(h.session.getDiagnostics().dragCount).toBe(1);
    h.session.setActive(false);
    config.onDragStart?.(event);
    config.onDrag?.(event);
    config.onDragEnd?.(event);
    expect(h.session.getDiagnostics().dragCount).toBe(1);
    await h.session.dispose();
    config.onDragStart?.(event);
    config.onDrag?.(event);
    config.onDragEnd?.(event);
    expect(h.session.getDiagnostics().dragCount).toBe(1);
  });

  it("restores the requested paused state after native dragging, including a view hidden during the drag", async () => {
    const h = harness();
    const order: string[] = [];
    h.session.controls(null, true);
    await h.session.update(data(), {
      onDragEnd: () => {
        order.push("callback");
      },
    });
    h.graph.pause.mockImplementation(() => {
      order.push("pause");
    });
    const config = h.configurations[0];
    const event = { dx: 4, dy: 2 } as Parameters<
      NonNullable<CosmographConfig["onDrag"]>
    >[0];
    config.onDragStart?.(event);
    config.onDrag?.(event);
    config.onDragEnd?.(event);
    expect(order).toEqual(["callback", "pause"]);
    h.session.controls(null, false);
    h.session.setActive(false);
    order.length = 0;
    config.onDragEnd?.(event);
    expect(order).toEqual(["pause"]);
    await h.session.dispose();
    order.length = 0;
    config.onDragEnd?.(event);
    expect(order).toEqual([]);
  });
});
