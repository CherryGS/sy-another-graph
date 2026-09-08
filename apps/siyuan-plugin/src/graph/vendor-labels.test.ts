import { afterEach, describe, expect, it, vi } from "vitest";
import { Labels } from "@cosmograph/cosmograph/cosmograph/modules/labels/index.js";
import { CosmographEventManager } from "@cosmograph/cosmograph/cosmograph/managers/event-manager.js";

// Exercise the installed, patched vendor methods. Only their DOM/GPU surroundings
// are stubbed; copying the patch's implementation into these tests would not detect
// a missing patch after a frozen install or a future dependency update.
function labelContext(dimensions: 2 | 3 = 2) {
  const point = { index: 1, position: [-1, -1] };
  const cluster = { index: 0, position: [-1, -1] };
  const points = dimensions === 3 ? [1, 2, 3, 4, 5, 6] : [1, 2, 4, 5];
  const clusters = dimensions === 3 ? [20, 21, 22] : [20, 21];
  const context = {
    _: {
      config: { showLabels: true },
      public: { is3D: dimensions === 3 },
      cosmos: {
        getPointPositions: vi.fn(() => new Float32Array(points)),
        getClusterPositions: vi.fn(() => clusters),
      },
    },
    _labelDataMap: new Map([["point", point], ["cluster-0", cluster]]),
    _renderLabels: vi.fn(),
  };
  return { context, point, cluster, update: () => Reflect.apply(Labels.prototype.updatePositions, context, []) };
}

function eventContext(readMs = 0) {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const labels = {
    updatePositions: vi.fn(() => { now += readMs; }),
    render: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    renderHoveredLabel: vi.fn(async () => {}),
    setZooming: vi.fn(),
  };
  const context = {
    config: { onSimulationTick: vi.fn() },
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

afterEach(() => vi.restoreAllMocks());

describe("Cosmograph 2.5.1 label readback patch", () => {
  it.each(["hidden", "empty"] as const)("skips point and cluster GPU reads for a %s label layer", (state) => {
    const h = labelContext();
    if (state === "hidden") h.context._.config.showLabels = false;
    else h.context._labelDataMap.clear();
    h.update();
    expect(h.context._.cosmos.getPointPositions).not.toHaveBeenCalled();
    expect(h.context._.cosmos.getClusterPositions).not.toHaveBeenCalled();
    expect(h.context._renderLabels).toHaveBeenCalledTimes(1);
  });

  it.each([2, 3] as const)("keeps visible point and cluster labels at their actual %sD coordinates", (dimensions) => {
    const h = labelContext(dimensions);
    h.update();
    expect(h.context._.cosmos.getPointPositions).toHaveBeenCalledExactlyOnceWith({ dimensions });
    expect(h.context._.cosmos.getClusterPositions).toHaveBeenCalledExactlyOnceWith({ dimensions });
    expect(h.point.position).toEqual(dimensions === 3 ? [4, 5, 6] : [4, 5]);
    expect(h.cluster.position).toEqual(dimensions === 3 ? [20, 21, 22] : [20, 21]);
    expect(h.context._renderLabels).toHaveBeenCalledTimes(1);
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
