import { afterEach, describe, expect, it, vi } from "vitest";
import { Labels } from "@cosmograph/cosmograph/cosmograph/modules/labels/index.js";
import { CosmographEventManager } from "@cosmograph/cosmograph/cosmograph/managers/event-manager.js";

// Exercise the installed, patched vendor methods. Only their DOM/GPU surroundings
// are stubbed; copying the patch's implementation into these tests would not detect
// a missing patch after a frozen install or a future dependency update.
function deferredPositions() {
  let resolve!: (positions: Float32Array) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Float32Array>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function labelContext(dimensions: 2 | 3 = 2) {
  const point = { index: 1, position: [-1, -1] };
  const cluster = { index: 0, position: [-1, -1] };
  const capture = deferredPositions();
  const positions = new Float32Array(dimensions === 3 ? [1, 2, 3, 4, 5, 6] : [1, 2, 4, 5]);
  const context = {
    _: {
      config: { showLabels: true },
      configManager: { configVersion: 1 },
      crossfilter: { isHighlightActive: false },
      public: { is3D: dimensions === 3, isSimulationRunning: true, getSampledPointPositionsMap: vi.fn() },
      cosmos: {
        getPointPositions: vi.fn(),
        getPointPositionsAsync: vi.fn((_options: { dimensions: number; signal: AbortSignal }) => capture.promise),
        getTrackedPointPositionsMap: vi.fn(),
        getClusterPositions: vi.fn(() => dimensions === 3 ? [20, 21, 22] : [20, 21]),
      },
      removeEventListener: vi.fn(),
    },
    _labelDataMap: new Map([["point", point]]),
    _staticLabelsMap: new Map([[1, ["point", "Point"]]]),
    _selectedLabelsMap: new Map(),
    _dynamicLabelsMap: new Map(),
    _sanitizedLabelTextCache: new Map(),
    _cachedSampledPointsPositions: new Map([[0, [-3, -4]], [1, [-1, -2]]]),
    _isZooming: false,
    _renderLabels: vi.fn(),
    render: vi.fn(),
    _addClusterLabelsToDataMap: vi.fn(),
  };
  Object.setPrototypeOf(context, Labels.prototype);
  return {
    context, point, cluster, capture, positions,
    update: () => Reflect.apply(Labels.prototype.updatePositions, context, []),
    invoke: (method: string, ...args: unknown[]) => Reflect.apply(Reflect.get(Labels.prototype, method), context, args),
    async complete() { capture.resolve(positions); await capture.promise; },
  };
}

function eventContext(readMs = 0, pending?: Promise<void>) {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const labels = {
    updatePositions: vi.fn(() => { now += readMs; return pending; }),
    flushPositions: vi.fn(async () => {}),
    render: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    renderHoveredLabel: vi.fn(async () => {}),
    setZooming: vi.fn(),
  };
  const context = {
    config: { onSimulationTick: vi.fn(), onSimulationPause: vi.fn(), onSimulationEnd: vi.fn() },
    labels,
    annotations: {
      updatePositions: vi.fn(),
      render: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      setZooming: vi.fn(),
    },
    dispatchEvent: vi.fn(),
  };
  const manager = new CosmographEventManager(context as unknown as ConstructorParameters<typeof CosmographEventManager>[0]);
  return {
    context, manager, labels,
    at(time: number) { now = time; },
    tick: () => manager.onSimulationTick(0.5, undefined, undefined),
  };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Cosmograph 2.5.1 label readback patch", () => {
  it.each(["hidden", "empty"] as const)("skips point and cluster GPU reads for a %s label layer", (state) => {
    const h = labelContext();
    if (state === "hidden") h.context._.config.showLabels = false;
    else h.context._labelDataMap.clear();
    h.update();
    expect(h.context._.cosmos.getPointPositions).not.toHaveBeenCalled();
    expect(h.context._.cosmos.getPointPositionsAsync).not.toHaveBeenCalled();
    expect(h.context._.cosmos.getClusterPositions).not.toHaveBeenCalled();
    expect(h.context._renderLabels).toHaveBeenCalledTimes(1);
  });

  it.each([2, 3] as const)("applies completed %sD coordinates without a synchronous point read", async (dimensions) => {
    const h = labelContext(dimensions);
    h.context._labelDataMap.set("cluster-0", h.cluster);
    h.update();
    expect(h.context._.cosmos.getPointPositionsAsync).toHaveBeenCalledExactlyOnceWith({ dimensions, signal: expect.any(AbortSignal) });
    expect(h.context._.cosmos.getPointPositions).not.toHaveBeenCalled();
    expect(h.point.position).toEqual([-1, -1]);
    await h.complete();
    expect(h.point.position).toEqual(dimensions === 3 ? [4, 5, 6] : [4, 5]);
    expect(h.cluster.position).toEqual(dimensions === 3 ? [20, 21, 22] : [20, 21]);
    expect(h.context._renderLabels).toHaveBeenCalledTimes(2);
    expect(h.context.render).not.toHaveBeenCalled();
    expect(h.context._.public.getSampledPointPositionsMap).not.toHaveBeenCalled();
  });

  it("coalesces repeated ticks and redraws the completed world coordinates while the next capture is pending", async () => {
    const h = labelContext();
    for (let index = 0; index < 10; index++) h.update();
    expect(h.context._.cosmos.getPointPositionsAsync).toHaveBeenCalledTimes(1);
    expect(h.context._.cosmos.getClusterPositions).not.toHaveBeenCalled();
    await h.complete();
    const next = deferredPositions();
    h.context._.cosmos.getPointPositionsAsync.mockReturnValue(next.promise);
    h.update();
    h.point.position = [-10, -20];
    h.update();
    expect(h.point.position).toEqual([4, 5]);
    expect(h.context._.cosmos.getPointPositionsAsync).toHaveBeenCalledTimes(2);
    expect(h.context._.cosmos.getPointPositions).not.toHaveBeenCalled();
    expect(h.context._renderLabels).toHaveBeenCalledTimes(13);
    h.invoke("clear");
  });

  it.each(["hidden", "empty", "clear", "destroy"] as const)("cancels demand and discards late completion after %s", async (change) => {
    const h = labelContext();
    h.update();
    const signal = h.context._.cosmos.getPointPositionsAsync.mock.calls[0]![0].signal;
    if (change === "hidden") { h.context._.config.showLabels = false; h.update(); }
    else if (change === "empty") { h.context._labelDataMap.clear(); h.update(); }
    else h.invoke(change);
    const renders = h.context._renderLabels.mock.calls.length;
    expect(signal.aborted).toBe(true);
    await h.complete();
    expect(h.point.position).toEqual([-1, -1]);
    expect(h.context._renderLabels).toHaveBeenCalledTimes(renders);
    expect(h.context._.cosmos.getPointPositions).not.toHaveBeenCalled();
  });

  it("aborts hidden label demand during config population even when simulation ticks are paused", async () => {
    const h = labelContext();
    h.update();
    const signal = h.context._.cosmos.getPointPositionsAsync.mock.calls[0]![0].signal;
    h.context._.config.showLabels = false;
    h.invoke("_populateLabelDataMap");
    expect(signal.aborted).toBe(true);
    expect(h.context._labelDataMap.size).toBe(0);
    await h.complete();
    expect(h.point.position).toEqual([-1, -1]);
  });

  it.each(["source", "dimensions", "cosmos"] as const)("rejects obsolete snapshots after a %s change", async (change) => {
    const h = labelContext();
    h.update();
    const oldSignal = h.context._.cosmos.getPointPositionsAsync.mock.calls[0]![0].signal;
    const next = deferredPositions();
    if (change === "source") h.context._.configManager.configVersion++;
    if (change === "dimensions") h.context._.public.is3D = true;
    if (change === "cosmos") h.context._.cosmos = { ...h.context._.cosmos, getPointPositionsAsync: vi.fn(() => next.promise) };
    else h.context._.cosmos.getPointPositionsAsync.mockReturnValue(next.promise);
    h.update();
    expect(oldSignal.aborted).toBe(true);
    await h.complete();
    expect(h.point.position).toEqual([-1, -1]);
    next.resolve(new Float32Array(change === "dimensions" ? [7, 8, 9, 10, 11, 12] : [7, 8, 10, 11]));
    await next.promise;
    expect(h.point.position).toEqual(change === "dimensions" ? [10, 11, 12] : [10, 11]);
  });

  it("reports an operational failure once and never starts a synchronous fallback or repeated retry", async () => {
    vi.stubGlobal("window", {});
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const h = labelContext();
    h.update();
    h.capture.reject(new Error("GPU fence failed"));
    await h.capture.promise.catch(() => {});
    for (let index = 0; index < 20; index++) h.update();
    expect(log).toHaveBeenCalledTimes(1);
    expect(h.context._.cosmos.getPointPositionsAsync).toHaveBeenCalledTimes(1);
    expect(h.context._.cosmos.getPointPositions).not.toHaveBeenCalled();
    expect(h.point.position).toEqual([-1, -1]);
  });

  it("allows a fresh capture after transient source invalidation without reporting cancellation as a fault", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const h = labelContext();
    h.update();
    h.capture.reject(new DOMException("source pending", "AbortError"));
    await h.capture.promise.catch(() => {});
    const next = deferredPositions();
    h.context._.cosmos.getPointPositionsAsync.mockReturnValue(next.promise);
    h.update();
    expect(h.context._.cosmos.getPointPositionsAsync).toHaveBeenCalledTimes(2);
    expect(log).not.toHaveBeenCalled();
    h.invoke("clear");
  });

  it.each([2, 3] as const)("reprojects known tracked and sampled labels from cached %sD world positions during zoom", async (dimensions) => {
    const h = labelContext(dimensions);
    h.update();
    await h.complete();
    h.context._isZooming = true;
    expect(h.invoke("_getTrackedPositions", true)).toEqual(new Map([[1, dimensions === 3 ? [4, 5, 6] : [4, 5]]]));
    expect(h.invoke("_getSampledPositions")).toEqual(new Map([
      [0, dimensions === 3 ? [1, 2, 3] : [1, 2]],
      [1, dimensions === 3 ? [4, 5, 6] : [4, 5]],
    ]));
    expect(h.context._.cosmos.getTrackedPointPositionsMap).not.toHaveBeenCalled();
    expect(h.context._.public.getSampledPointPositionsMap).not.toHaveBeenCalled();
    // Releasing zoom preserves the vendor's original candidate-sampling path.
    h.context._isZooming = false;
    h.invoke("_getSampledPositions");
    expect(h.context._.public.getSampledPointPositionsMap).toHaveBeenCalledTimes(1);
  });

  it("returns the same pending native snapshot promise until coordinates have been applied", async () => {
    const h = labelContext();
    const pending = h.update();
    expect(pending).toBeInstanceOf(Promise);
    expect(h.update()).toBe(pending);
    expect(h.context._.cosmos.getPointPositionsAsync).toHaveBeenCalledTimes(1);
    h.capture.resolve(h.positions);
    await pending;
    expect(h.point.position).toEqual([4, 5]);
    expect(h.context._renderLabels).toHaveBeenCalledTimes(3);
  });

  it.each(["AbortError", "Error"])("settles the native snapshot promise after %s without a synchronous fallback", async (name) => {
    vi.stubGlobal("window", {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const h = labelContext();
    const pending = h.update();
    const failure = new Error("read ended");
    failure.name = name;
    h.capture.reject(failure);
    await expect(pending).resolves.toBeUndefined();
    expect(h.context._.cosmos.getPointPositions).not.toHaveBeenCalled();
  });

  it.each([
    { completedAt: 10, nextAt: 60 },
    { completedAt: 20, nextAt: 80 },
    { completedAt: 120, nextAt: 370 },
  ])("waits for async completion at $completedAt ms, then applies cooldown until $nextAt ms", async ({ completedAt, nextAt }) => {
    const read = deferredPositions();
    const pending = read.promise.then(() => {});
    const h = eventContext(0, pending);
    const timer = vi.spyOn(globalThis, "setTimeout");
    h.tick();
    for (let time = 1; time < completedAt; time++) { h.at(time); h.tick(); }
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(1);
    h.at(completedAt);
    read.resolve(new Float32Array());
    await pending;
    h.at(nextAt - 1);
    h.tick();
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(1);
    h.at(nextAt);
    h.tick();
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(2);
    expect(h.context.config.onSimulationTick).toHaveBeenCalledTimes(completedAt + 2);
    expect(h.context.annotations.updatePositions).toHaveBeenCalledTimes(completedAt + 2);
    expect(h.context.dispatchEvent).toHaveBeenCalledTimes(completedAt + 2);
    expect(timer).not.toHaveBeenCalled();
    await pending;
  });

  it.each(["AbortError", "Error"])("releases the event-manager pending state after %s and waits through cooldown before retry", async (name) => {
    const read = deferredPositions();
    const pending = read.promise.then(() => {});
    const h = eventContext(0, pending);
    h.tick();
    h.at(120);
    const failure = new Error("snapshot rejected");
    failure.name = name;
    read.reject(failure);
    await pending.catch(() => {});
    for (let time = 121; time < 370; time++) { h.at(time); h.tick(); }
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(1);
    h.at(370);
    h.tick();
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(2);
    await pending.catch(() => {});
  });

  it("keeps drag, transition, resize and zoom projections immediate while the simulation snapshot is pending", async () => {
    const read = deferredPositions();
    const pending = read.promise.then(() => {});
    const h = eventContext(0, pending);
    h.tick();
    h.at(10);
    Reflect.apply(h.manager.onDrag, h.manager, []);
    Reflect.apply(h.manager.onTransition, h.manager, []);
    Reflect.apply(h.manager.onResize, h.manager, []);
    await Reflect.apply(h.manager.onZoom, h.manager, [{ sourceEvent: new Event("wheel") }]);
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(4);
    expect(h.labels.render).toHaveBeenCalledTimes(1);
    h.tick();
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(4);
    h.at(120);
    read.resolve(new Float32Array());
    await pending;
    h.at(369);
    h.tick();
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(4);
    h.at(370);
    h.tick();
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(5);
    await pending;
  });

  it("captures final positions immediately while idle without a second read or a sampled-label query", async () => {
    const h = labelContext();
    const final = h.invoke("flushPositions");
    expect(h.context._.cosmos.getPointPositionsAsync).toHaveBeenCalledTimes(1);
    h.capture.resolve(h.positions);
    await final;
    expect(h.point.position).toEqual([4, 5]);
    expect(h.context._.cosmos.getPointPositionsAsync).toHaveBeenCalledTimes(1);
    expect(h.context.render).not.toHaveBeenCalled();
    expect(h.context._.public.getSampledPointPositionsMap).not.toHaveBeenCalled();
  });

  it.each(["completed", "cancelled"])("queues exactly one fresh final snapshot after a %s older request", async (ending) => {
    const h = labelContext();
    const old = h.update();
    const next = deferredPositions();
    h.context._.cosmos.getPointPositionsAsync.mockReturnValue(next.promise);
    const final = h.invoke("flushPositions");
    expect(h.invoke("flushPositions")).toBe(final);
    expect(h.context._.cosmos.getPointPositionsAsync).toHaveBeenCalledTimes(1);
    if (ending === "completed") h.capture.resolve(h.positions);
    else h.capture.reject(new DOMException("simulation stopped", "AbortError"));
    await old;
    expect(h.context._.cosmos.getPointPositionsAsync).toHaveBeenCalledTimes(2);
    next.resolve(new Float32Array([10, 20, 30, 40]));
    await final;
    expect(h.point.position).toEqual([30, 40]);
    expect(h.context._.cosmos.getPointPositionsAsync).toHaveBeenCalledTimes(2);
    expect(h.context.render).not.toHaveBeenCalled();
    expect(h.context._.cosmos.getPointPositions).not.toHaveBeenCalled();
  });

  it.each(["hidden", "clear", "destroy", "source", "dimensions", "cosmos"] as const)("discards queued final demand after %s", async (change) => {
    const h = labelContext();
    h.update();
    const final = h.invoke("flushPositions");
    const reads = h.context._.cosmos.getPointPositionsAsync;
    if (change === "hidden") h.context._.config.showLabels = false;
    else if (change === "source") h.context._.configManager.configVersion++;
    else if (change === "dimensions") h.context._.public.is3D = true;
    else if (change === "cosmos") h.context._.cosmos = { ...h.context._.cosmos };
    else h.invoke(change);
    h.capture.resolve(h.positions);
    await final;
    expect(reads).toHaveBeenCalledTimes(1);
    expect(h.point.position).toEqual([-1, -1]);
  });

  it("settles final demand after an operational failure without retrying or falling back", async () => {
    vi.stubGlobal("window", {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const h = labelContext();
    h.update();
    const final = h.invoke("flushPositions");
    h.capture.reject(new Error("transfer failed"));
    await final;
    expect(h.context._.cosmos.getPointPositionsAsync).toHaveBeenCalledTimes(1);
    expect(h.context._.cosmos.getPointPositions).not.toHaveBeenCalled();
  });

  it("retains a later stop demand when an earlier final capture is cancelled by that stop", async () => {
    const h = labelContext();
    const first = h.invoke("flushPositions");
    const next = deferredPositions();
    h.context._.cosmos.getPointPositionsAsync.mockReturnValue(next.promise);
    const latest = h.invoke("flushPositions");
    expect(h.invoke("flushPositions")).toBe(latest);
    h.capture.reject(new DOMException("another stop boundary", "AbortError"));
    await first;
    expect(h.context._.cosmos.getPointPositionsAsync).toHaveBeenCalledTimes(2);
    next.resolve(new Float32Array([10, 20, 30, 40]));
    await latest;
    expect(h.point.position).toEqual([30, 40]);
  });

  it("bypasses simulation pending state and cooldown for pause/end final flushes", async () => {
    const read = deferredPositions();
    const pending = read.promise.then(() => {});
    const h = eventContext(0, pending);
    h.tick();
    h.at(1);
    Reflect.apply(h.manager.onSimulationPause, h.manager, []);
    Reflect.apply(h.manager.onSimulationEnd, h.manager, []);
    expect(h.labels.flushPositions).toHaveBeenCalledTimes(2);
    expect(h.context.config.onSimulationPause).toHaveBeenCalledTimes(1);
    expect(h.context.config.onSimulationEnd).toHaveBeenCalledTimes(1);
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(1);
    read.resolve(new Float32Array());
    await pending;
  });

  it("allows at most 20 cheap simulation label updates per second while forwarding every simulation callback", () => {
    const h = eventContext();
    for (let time = 0; time < 1000; time++) {
      h.at(time);
      h.tick();
    }
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(20);
    expect(h.context.config.onSimulationTick).toHaveBeenCalledTimes(1000);
    expect(h.context.annotations.updatePositions).toHaveBeenCalledTimes(1000);
    expect(h.context.dispatchEvent).toHaveBeenCalledTimes(1000);
  });

  it("starts the adaptive cooldown after a read completes", () => {
    const h = eventContext(20);
    h.tick(); // Finishes at 20ms; 60ms cooldown ends at 80ms.
    h.at(79);
    h.tick();
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(1);
    h.at(80);
    h.tick();
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(2);
  });

  it("caps a slow read's cooldown at 250ms without scheduling background work", () => {
    const timer = vi.spyOn(globalThis, "setTimeout");
    const h = eventContext(120);
    h.tick(); // Finishes at 120ms; capped cooldown ends at 370ms.
    h.at(369);
    h.tick();
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(1);
    h.at(370);
    h.tick();
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(2);
    expect(timer).not.toHaveBeenCalled();
  });

  it("keeps dragging, position transitions, resize and zoom updates immediate during cooldown", async () => {
    const h = eventContext();
    h.tick();
    h.at(1);
    Reflect.apply(h.manager.onDrag, h.manager, []);
    Reflect.apply(h.manager.onTransition, h.manager, []);
    Reflect.apply(h.manager.onResize, h.manager, []);
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(4);
    await Reflect.apply(h.manager.onZoom, h.manager, [{ sourceEvent: new Event("wheel") }]);
    expect(h.labels.render).toHaveBeenCalledTimes(1);
    h.tick();
    expect(h.labels.updatePositions).toHaveBeenCalledTimes(4);
  });
});
