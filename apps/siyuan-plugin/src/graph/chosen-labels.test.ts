import { describe, expect, it, vi } from "vitest";
import { ChosenLabels } from "./chosen-labels";
import type { PreparedGraph } from "./prepare-graph";
import type { Dimensions, PointPosition } from "./geometry";

class ElementStub extends EventTarget {
  readonly children: ElementStub[] = [];
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  parent?: ElementStub;
  className = "";
  textContent = "";
  hidden = false;
  type = "";
  readonly ownerDocument = { createElement: () => new ElementStub() };
  appendChild(child: ElementStub) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parent) {
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = undefined;
    }
  }
  setAttribute(key: string, value: string) {
    this.attributes[key] = value;
  }
  set innerHTML(_value: string) {
    throw new Error("Source labels must never use HTML");
  }
}

function prepared(count: number, order = Array.from({ length: count }, (_, index) => index)): PreparedGraph {
  const indexToNode = order.map((index) => ({
    id: `id-${index}`,
    label: index ? `Node ${index}` : "<img src='invalid'>",
    index,
    degree: 0,
    notebook: "",
    path: "",
    color: "#000000",
  }));
  return {
    config: {},
    indexToNode,
    indexToEdge: [],
    indexToId: indexToNode.map((node) => node.id),
    indexToLabel: indexToNode.map((node) => node.label),
    idToIndex: new Map(indexToNode.map((node, index) => [node.id, index])),
    pointsCount: count,
    linksCount: 0,
    preparationMs: 0,
  };
}

interface DeferredRead {
  dimensions: Dimensions;
  signal?: AbortSignal;
  resolve(value: Float32Array): void;
  reject(reason: unknown): void;
}

function harness(count = 2) {
  const host = new ElementStub();
  const frames = new Map<number, () => void>();
  const requests: DeferredRead[] = [];
  let next = 0;
  let now = 0;
  const clicked = vi.fn();
  const hover = vi.fn();
  const reportError = vi.fn();
  const geometry = {
    is3D: false,
    getPointPositions: vi.fn(() => {
      throw new Error("Label reads must never fall back to synchronous GPU access");
    }),
    getPointPositionsAsync: vi.fn((options?: { dimensions?: Dimensions; signal?: AbortSignal }) =>
      new Promise<Float32Array>((resolve, reject) => {
        // Intentionally ignore abort: the consumer must reject even a late successful result.
        requests.push({ dimensions: options?.dimensions ?? 2, signal: options?.signal, resolve, reject });
      }),
    ),
    spaceToScreenPosition: vi.fn(
      (position: PointPosition): [number, number] => [position[0] * 2, position[1] * 2],
    ),
    getPointScreenRadiusByIndex: vi.fn(() => 4),
  };
  const labels = new ChosenLabels(
    host as unknown as HTMLElement,
    geometry,
    clicked,
    hover,
    {
      frame(callback) {
        frames.set(++next, callback);
        return next;
      },
      cancelFrame(id) {
        frames.delete(id);
      },
      now: () => now,
    },
    reportError,
  );
  const draw = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback();
  };
  const resolve = async (positions?: Float32Array, index = requests.length - 1) => {
    const read = requests[index];
    read.resolve(positions ?? Float32Array.from({ length: count * read.dimensions }, (_, item) => item + 10));
    await Promise.resolve();
  };
  const reject = async (error: unknown, index = requests.length - 1) => {
    requests[index].reject(error);
    await Promise.resolve();
  };
  const ready = async (positions?: Float32Array) => {
    draw();
    await resolve(positions);
    draw();
  };
  const button = (id: string) => host.children[0].children.find((child) => child.dataset.graphNodeId === id)!;
  const setTime = (value: number) => { now = value; };
  return { host, frames, requests, geometry, labels, clicked, hover, reportError, draw, resolve, reject, ready, button, setTime };
}

describe("persistent chosen labels", () => {
  it("keeps pinned coordinates through simulation, pause-control updates, and camera projection", async () => {
    const h = harness();
    const data = prepared(2);
    h.labels.update(data, ["id-0", "id-1"]);
    await h.ready();
    for (let tick = 0; tick < 60; tick++) {
      h.setTime(tick * 20);
      h.labels.refresh("simulation");
      // Controls can pass equal IDs in new arrays when paused or inspected state changes.
      h.labels.update(data, ["id-1", "id-0"]);
      h.draw();
    }
    expect(h.requests).toHaveLength(1);
    h.geometry.spaceToScreenPosition.mockImplementation((position) => [position[0] * 3, position[1] * 3]);
    h.labels.refresh("projection");
    h.labels.setActive(true);
    h.draw();
    expect(h.requests).toHaveLength(1);
    expect(h.button("id-0").style.left).toBe("30px");
    h.labels.refresh();
    h.draw();
    expect(h.requests).toHaveLength(2);
    await h.resolve(new Float32Array([50, 60, 12, 13]));
    h.draw();
    expect(h.button("id-0").style.left).toBe("150px");
    expect(h.geometry.getPointPositions).not.toHaveBeenCalled();
    h.labels.dispose();
  });

  it("coalesces simulation ticks without aborting a pending read or rereading pinned coordinates", async () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"], ["id-1"]);
    h.draw();
    for (let tick = 0; tick < 60; tick++) {
      h.labels.refresh("simulation");
      h.draw();
    }
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].signal?.aborted).toBe(false);
    await h.resolve(new Float32Array([10, 11, 50, 60]));
    h.draw();
    expect(h.requests).toHaveLength(1);
    expect(h.button("id-0").style.left).toBe("20px");
    expect(h.button("id-1").style.left).toBe("100px");
    h.setTime(50);
    h.labels.refresh("simulation");
    h.draw();
    expect(h.requests).toHaveLength(2);
    await h.resolve(new Float32Array([999, 999, 70, 80]));
    h.draw();
    expect(h.button("id-0").style.left).toBe("20px");
    expect(h.button("id-1").style.left).toBe("140px");
    expect(h.requests).toHaveLength(2);
    expect(h.frames.size).toBe(0);
    expect(h.geometry.getPointPositions).not.toHaveBeenCalled();
    h.labels.dispose();
  });

  it("projects cached world positions during a pending read and uses the latest camera on completion", async () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"], ["id-1"]);
    await h.ready(new Float32Array([10, 11, 50, 60]));
    h.setTime(50);
    h.labels.refresh("simulation");
    h.draw();
    h.geometry.spaceToScreenPosition.mockImplementation((position) => [position[0] * 3, position[1] * 3]);
    h.labels.refresh("projection");
    h.draw();
    expect(h.button("id-0").style.left).toBe("30px");
    expect(h.button("id-1").style.left).toBe("150px");
    expect(h.requests).toHaveLength(2);
    expect(h.requests[1].signal?.aborted).toBe(false);
    await h.resolve(new Float32Array([10, 11, 70, 80]));
    h.geometry.spaceToScreenPosition.mockImplementation((position) => [position[0] * 4, position[1] * 4]);
    h.draw();
    expect(h.button("id-0").style.left).toBe("40px");
    expect(h.button("id-1").style.left).toBe("280px");
    expect(h.requests).toHaveLength(2);
    h.labels.dispose();
  });

  it.each([
    [0, 50],
    [20, 60],
    [120, 250],
  ])("waits after a %d ms moving read for a %d ms cooldown without idle polling", async (duration, cooldown) => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"], ["id-1"]);
    await h.ready();
    h.setTime(50);
    h.labels.refresh("simulation");
    h.draw();
    h.labels.refresh("simulation");
    h.draw();
    expect(h.requests).toHaveLength(2);
    const completedAt = 50 + duration;
    h.setTime(completedAt);
    await h.resolve(new Float32Array([10, 11, 50, 60]));
    h.draw();
    expect(h.frames.size).toBe(0);
    expect(h.requests).toHaveLength(2);
    for (const time of [completedAt, completedAt + cooldown - 1]) {
      h.setTime(time);
      h.labels.refresh("simulation");
      expect(h.frames.size).toBe(0);
      h.draw();
    }
    h.setTime(completedAt + cooldown);
    expect(h.frames.size).toBe(0);
    h.labels.refresh("simulation");
    h.draw();
    expect(h.requests).toHaveLength(3);
    h.labels.dispose();
  });

  it.each(["positions", "membership", "data", "dimensions"])("lets an explicit %s change bypass moving-read cooldown", async (change) => {
    const h = harness();
    const data = prepared(2);
    h.labels.update(data, ["id-0"], ["id-1"]);
    await h.ready();
    h.setTime(1);
    h.labels.refresh("simulation");
    expect(h.frames.size).toBe(0);
    h.geometry.spaceToScreenPosition.mockImplementation((position) => [position[0] * 3, position[1] * 3]);
    h.labels.refresh("projection");
    h.draw();
    expect(h.requests).toHaveLength(1);
    expect(h.button("id-0").style.left).toBe("30px");
    if (change === "positions") h.labels.refresh();
    else if (change === "membership") h.labels.update(data, ["id-1"], ["id-0"]);
    else if (change === "data") h.labels.update(prepared(2, [1, 0]), ["id-0"], ["id-1"]);
    else {
      h.geometry.is3D = true;
      h.labels.refresh("projection");
    }
    h.draw();
    expect(h.requests).toHaveLength(2);
    expect(h.requests[1].dimensions).toBe(change === "dimensions" ? 3 : 2);
    h.labels.dispose();
  });

  it("does not let a late result from an older generation postpone the current moving read", async () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"], ["id-1"]);
    h.draw();
    h.labels.update(prepared(2, [1, 0]), ["id-0"], ["id-1"]);
    h.draw();
    h.setTime(10);
    await h.resolve(new Float32Array([50, 60, 10, 20]), 1);
    h.draw();
    h.setTime(1000);
    await h.resolve(new Float32Array([100, 101, 200, 201]), 0);
    h.labels.refresh("simulation");
    h.draw();
    expect(h.requests).toHaveLength(3);
    expect(h.button("id-0").style.left).toBe("20px");
    h.labels.dispose();
  });

  it("keeps the bounded frame retry after a moving read aborts", async () => {
    const h = harness();
    h.labels.update(prepared(2), [], ["id-1"]);
    await h.ready();
    h.setTime(50);
    h.labels.refresh("simulation");
    h.draw();
    h.setTime(170);
    await h.reject(new DOMException("Source changed", "AbortError"));
    expect(h.frames.size).toBe(1);
    h.draw();
    expect(h.requests).toHaveLength(3);
    expect(h.reportError).not.toHaveBeenCalled();
    h.labels.dispose();
  });

  it("flushes final moving coordinates when simulation stops during cooldown without another tick", async () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"], ["id-1"]);
    await h.ready();
    h.setTime(10);
    h.labels.refresh("simulation");
    expect(h.frames.size).toBe(0);
    h.labels.refreshAfterSimulation();
    h.labels.refreshAfterSimulation();
    h.draw();
    expect(h.requests).toHaveLength(2);
    await h.resolve(new Float32Array([10, 11, 50, 60]));
    h.draw();
    expect(h.button("id-1").style.left).toBe("100px");
    expect(h.frames.size).toBe(0);
    expect(h.requests).toHaveLength(2);
    expect(h.geometry.getPointPositions).not.toHaveBeenCalled();
    h.labels.dispose();
  });

  it("queues one final read behind a pending moving snapshot and bypasses its new cooldown", async () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"], ["id-1"]);
    await h.ready();
    h.setTime(50);
    h.labels.refresh("simulation");
    h.draw();
    h.setTime(60);
    h.labels.refreshAfterSimulation();
    h.draw();
    expect(h.requests).toHaveLength(2);
    expect(h.requests[1].signal?.aborted).toBe(false);
    h.setTime(80);
    await h.resolve(new Float32Array([10, 11, 30, 40]));
    h.draw();
    expect(h.requests).toHaveLength(3);
    await h.resolve(new Float32Array([10, 11, 70, 80]));
    h.draw();
    expect(h.button("id-1").style.left).toBe("140px");
    expect(h.frames.size).toBe(0);
    expect(h.requests).toHaveLength(3);
    h.labels.dispose();
  });

  it("does not request a final simulation sample for pinned-only labels", async () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0", "id-1"]);
    h.draw();
    h.labels.refreshAfterSimulation();
    await h.resolve();
    h.draw();
    h.labels.refreshAfterSimulation();
    h.draw();
    expect(h.requests).toHaveLength(1);
    expect(h.frames.size).toBe(0);
    h.labels.dispose();
  });

  it("does not hand final-sample callbacks to inactive or disposed label owners", async () => {
    const h = harness();
    h.labels.update(prepared(2), [], ["id-1"]);
    await h.ready();
    h.labels.refreshAfterSimulation();
    h.draw();
    h.labels.setActive(false);
    expect(h.requests[1].signal?.aborted).toBe(true);
    h.labels.refreshAfterSimulation();
    await h.resolve(new Float32Array([10, 11, 999, 999]));
    expect(h.frames.size).toBe(0);
    expect(h.button("id-1").style.left).toBe("24px");
    h.labels.setActive(true);
    await h.ready();
    h.labels.refreshAfterSimulation();
    const staleFrame = h.frames.values().next().value!;
    h.labels.dispose();
    h.labels.refreshAfterSimulation();
    staleFrame();
    expect(h.frames.size).toBe(0);
    expect(h.requests).toHaveLength(3);
    expect(h.host.children).toHaveLength(0);
  });

  it("retains a final explicit drag refresh that arrives during an earlier read", async () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"]);
    await h.ready();
    h.labels.refresh();
    h.draw();
    h.labels.refresh();
    h.labels.refresh();
    expect(h.requests[1].signal?.aborted).toBe(false);
    await h.resolve(new Float32Array([30, 40, 12, 13]));
    h.draw();
    expect(h.requests).toHaveLength(3);
    await h.resolve(new Float32Array([50, 60, 12, 13]));
    h.draw();
    expect(h.button("id-0").style.left).toBe("100px");
    expect(h.requests).toHaveLength(3);
    h.labels.dispose();
  });

  it("uses XYZ stride and 3D projection, hiding nonfinite and behind-camera positions", async () => {
    const h = harness(3);
    h.geometry.is3D = true;
    h.geometry.spaceToScreenPosition.mockImplementation((position) =>
      (position[2] ?? 0) < 0 ? [NaN, NaN] : [position[0] + (position[2] ?? 0), position[1]],
    );
    h.labels.update(prepared(3), ["id-0", "id-1", "id-2"]);
    await h.ready(new Float32Array([10, 20, 30, 40, 50, -60, NaN, NaN, NaN]));
    expect(h.requests[0].dimensions).toBe(3);
    expect(h.geometry.spaceToScreenPosition).toHaveBeenCalledWith([10, 20, 30], { dimensions: 3 });
    expect(h.geometry.getPointScreenRadiusByIndex).toHaveBeenCalledWith(0, [10, 20, 30]);
    expect(h.button("id-0").style.left).toBe("40px");
    expect(h.button("id-1").style.visibility).toBe("hidden");
    expect(h.button("id-2").style.visibility).toBe("hidden");
    h.labels.dispose();
  });

  it("creates every chosen label without the native limit and keeps source text literal", async () => {
    const data = prepared(125);
    const h = harness(125);
    h.labels.update(data, data.indexToId);
    const layer = h.host.children[0];
    expect(layer.children).toHaveLength(125);
    expect(layer.children[0].style.visibility).toBe("hidden");
    await h.ready();
    expect(layer.children[0].textContent).toBe("<img src='invalid'>");
    expect(layer.children[0].style.left).toBe("20px");
    expect(layer.children[0].style.top).toBe("11px");
    expect(h.requests).toHaveLength(1);
    h.labels.dispose();
    expect(h.host.children).toHaveLength(0);
  });

  it("drops late results when new data reorders the same number of stable IDs", async () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"], ["id-1"]);
    h.draw();
    h.labels.update(prepared(2, [1, 0]), ["id-0"], ["id-1"]);
    expect(h.requests[0].signal?.aborted).toBe(true);
    h.draw();
    expect(h.requests).toHaveLength(2);
    await h.resolve(new Float32Array([100, 101, 200, 201]), 0);
    h.draw();
    expect(h.button("id-0").style.visibility).toBe("hidden");
    await h.resolve(new Float32Array([50, 60, 10, 20]), 1);
    h.draw();
    expect(h.button("id-0").style.left).toBe("20px");
    expect(h.button("id-1").style.left).toBe("100px");
    h.labels.dispose();
  });

  it("invalidates selection roles even when the displayed label union is unchanged", async () => {
    const h = harness();
    const data = prepared(2);
    h.labels.update(data, ["id-0"], ["id-1"]);
    h.draw();
    h.labels.update(data, ["id-1"], ["id-0"]);
    expect(h.requests[0].signal?.aborted).toBe(true);
    expect(h.button("id-0").className).toContain("--spotlight");
    expect(h.button("id-1").className).not.toContain("--spotlight");
    h.draw();
    await h.resolve(new Float32Array([100, 101, 200, 201]), 0);
    expect(h.frames.size).toBe(0);
    await h.resolve(new Float32Array([10, 11, 20, 21]), 1);
    h.draw();
    expect(h.button("id-0").style.left).toBe("20px");
    h.labels.update(data, [], []);
    expect(h.host.children[0].children).toHaveLength(0);
    expect(h.frames.size).toBe(0);
    h.labels.dispose();
  });

  it("does not restart an in-flight read for an equivalent update or repeated activation", async () => {
    const h = harness();
    const data = prepared(2);
    h.labels.update(data, ["id-0", "id-0"], ["id-1"]);
    h.draw();
    h.labels.update(data, ["id-0"], ["id-1", "id-1"]);
    h.labels.setActive(true);
    h.draw();
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].signal?.aborted).toBe(false);
    await h.resolve();
    h.draw();
    expect(h.requests).toHaveLength(1);
    h.labels.dispose();
  });

  it.each(["refresh", "completion"])("rejects an old dimensional snapshot on %s", async (trigger) => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"]);
    h.draw();
    h.geometry.is3D = true;
    if (trigger === "refresh") h.labels.refresh("projection");
    else await h.resolve(new Float32Array([10, 20, 30, 40]), 0);
    expect(h.requests[0].signal?.aborted).toBe(true);
    h.draw();
    expect(h.requests[1].dimensions).toBe(3);
    if (trigger === "refresh") await h.resolve(new Float32Array([10, 20, 30, 40]), 0);
    await h.resolve(new Float32Array([50, 60, 70, 80, 90, 100]), 1);
    h.draw();
    expect(h.geometry.spaceToScreenPosition).toHaveBeenCalledWith([50, 60, 70], { dimensions: 3 });
    expect(h.button("id-0").style.left).toBe("100px");
    h.labels.dispose();
  });

  it("bounds operational failures per generation until explicit demand retries", async () => {
    const h = harness();
    h.labels.update(prepared(2), [], ["id-1"]);
    await h.ready();
    h.setTime(50);
    h.labels.refresh("simulation");
    h.draw();
    await h.reject(new Error("GPU readback failed"));
    expect(h.frames.size).toBe(0);
    expect(h.button("id-1").style.left).toBe("24px");
    expect(h.geometry.getPointPositions).not.toHaveBeenCalled();
    for (let tick = 0; tick < 60; tick++) {
      h.labels.refresh("simulation");
      h.draw();
    }
    expect(h.requests).toHaveLength(2);
    expect(h.reportError).toHaveBeenCalledTimes(1);
    h.labels.refresh();
    h.draw();
    await h.reject(new Error("GPU still unavailable"));
    expect(h.reportError).toHaveBeenCalledTimes(1);
    h.labels.refresh();
    h.draw();
    await h.resolve(new Float32Array([10, 11, 50, 60]));
    h.draw();
    expect(h.button("id-1").style.left).toBe("100px");
    expect(h.requests).toHaveLength(4);
    h.labels.dispose();
  });

  it("recovers a transient pinned-only abort on an owned frame while simulation is paused", async () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"]);
    h.draw();
    await h.reject(new DOMException("Source positions are committing", "AbortError"));
    expect(h.frames.size).toBe(1);
    expect(h.reportError).not.toHaveBeenCalled();
    expect(h.button("id-0").style.visibility).toBe("hidden");
    h.draw();
    expect(h.requests).toHaveLength(2);
    await h.resolve();
    h.draw();
    expect(h.button("id-0").style.left).toBe("20px");
    h.labels.refresh("simulation");
    h.draw();
    expect(h.requests).toHaveLength(2);
    h.labels.dispose();
  });

  it("bounds automatic abort retries and accepts a later tick after the source commits", async () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"]);
    h.draw();
    await h.reject(new DOMException("Pending upload", "AbortError"));
    h.draw();
    await h.reject(new DOMException("Upload still pending", "AbortError"));
    expect(h.frames.size).toBe(0);
    expect(h.requests).toHaveLength(2);
    expect(h.reportError).not.toHaveBeenCalled();
    h.labels.refresh("simulation");
    h.draw();
    await h.resolve();
    h.draw();
    expect(h.button("id-0").style.visibility).toBe("visible");
    expect(h.requests).toHaveLength(3);
    h.labels.dispose();
  });

  it("discards incomplete buffers without corrupting cached positions or retrying in a loop", async () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"]);
    await h.ready();
    h.labels.refresh();
    h.draw();
    await h.resolve(new Float32Array([999, 999]));
    expect(h.frames.size).toBe(0);
    expect(h.button("id-0").style.left).toBe("20px");
    h.labels.dispose();
  });

  it("cancels hidden work and ignores late callbacks after reactivation or disposal", async () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"]);
    const cancelledFrame = h.frames.values().next().value!;
    h.labels.setActive(false);
    expect(h.frames.size).toBe(0);
    h.labels.setActive(true);
    cancelledFrame();
    expect(h.frames.size).toBe(1);
    h.draw();
    h.labels.setActive(false);
    expect(h.requests[0].signal?.aborted).toBe(true);
    await h.resolve(new Float32Array([100, 100, 200, 200]), 0);
    expect(h.frames.size).toBe(0);
    h.labels.setActive(true);
    await h.ready();
    expect(h.button("id-0").style.left).toBe("20px");
    h.labels.refresh();
    h.draw();
    const layer = h.host.children[0];
    const button = h.button("id-0");
    h.labels.dispose();
    expect(h.requests[2].signal?.aborted).toBe(true);
    await h.reject(new DOMException("Cancelled", "AbortError"), 2);
    button.dispatchEvent(new Event("click"));
    button.dispatchEvent(new Event("mouseenter"));
    button.dispatchEvent(new Event("mouseleave"));
    h.labels.setActive(true);
    h.labels.refresh();
    h.draw();
    expect(h.clicked).not.toHaveBeenCalled();
    expect(h.hover).not.toHaveBeenCalled();
    expect(h.host.children).toHaveLength(0);
    expect(layer.hidden).toBe(true);
    expect(h.frames.size).toBe(0);
    expect(h.requests).toHaveLength(3);
  });

  it("updates events by stable ID and disables callbacks from removed label elements", () => {
    const h = harness(3);
    const data = prepared(3);
    h.labels.update(data, ["id-0"], ["id-1"]);
    const removed = h.button("id-0");
    h.labels.update(data, ["id-2", "missing"]);
    const button = h.button("id-2");
    expect(h.host.children[0].children).toHaveLength(1);
    button.dispatchEvent(new Event("click"));
    button.dispatchEvent(new Event("mouseenter"));
    expect(h.clicked.mock.calls[0][0]).toBe("id-2");
    expect(h.hover).toHaveBeenCalledWith(data.indexToNode[2]);
    h.hover.mockClear();
    removed.dispatchEvent(new Event("click"));
    removed.dispatchEvent(new Event("mouseleave"));
    expect(h.clicked).toHaveBeenCalledTimes(1);
    expect(h.hover).not.toHaveBeenCalled();
    h.labels.dispose();
  });
});
