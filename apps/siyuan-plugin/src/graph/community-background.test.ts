import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunityBackground } from "./community-background";
import type { AsyncPointGeometry } from "./geometry";
import type { PreparedGraph } from "./prepare-graph";

function harness() {
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    frames.set(++sequence, fn);
    return sequence;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("window", { setTimeout, devicePixelRatio: 1 });
  const context = {
    clearRect: vi.fn(),
    resetTransform: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    putImageData: vi.fn(),
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  };
  const canvas = {
    width: 0,
    height: 0,
    clientWidth: 120,
    clientHeight: 100,
    hidden: false,
    dataset: {} as Record<string, string>,
    getContext: () => context,
    ownerDocument: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) },
  };
  const reads: {
    resolve: (p: Float32Array) => void;
    reject: (e: Error) => void;
    signal: AbortSignal;
  }[] = [];
  const geometry = {
    is3D: false,
    spaceToScreenPosition: (point: number[]) => point,
    getPointPositionsAsync: vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<Float32Array>((resolve, reject) => reads.push({ resolve, reject, signal })),
    ),
  };
  const background = new CommunityBackground(
    canvas as unknown as HTMLCanvasElement,
    geometry as unknown as AsyncPointGeometry,
  );
  const data = { pointsCount: 2, indexToId: ["a", "b"] } as PreparedGraph;
  const partition = {
    membership: new Uint32Array([0, 0]),
    sizes: new Uint32Array([2, 0]),
    count: 1,
    calculationMs: 1,
  };
  const frame = () => {
    const current = [...frames.values()];
    frames.clear();
    for (const f of current) f(0);
  };
  return { background, data, partition, geometry, reads, frame, canvas, context };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("community background lifetime", () => {
  it("reads asynchronously once for a paused view and reuses coordinates for projection", async () => {
    const h = harness();
    h.background.update(h.data, h.partition, true);
    h.frame();
    expect(h.reads).toHaveLength(0);
    h.background.setActive(true);
    h.frame();
    expect(h.reads).toHaveLength(1);
    h.reads[0].resolve(new Float32Array([30, 30, 36, 30]));
    await Promise.resolve();
    h.frame();
    expect(h.context.drawImage).toHaveBeenCalled();
    h.background.refresh("projection");
    h.frame();
    expect(h.reads).toHaveLength(1);
    h.background.setActive(false);
    h.background.refresh("simulation");
    h.frame();
    expect(h.canvas.hidden).toBe(true);
    expect(h.reads).toHaveLength(1);
    h.background.dispose();
  });

  it("cancels obsolete captures and never draws their result after replacement or disposal", async () => {
    const h = harness();
    h.background.update(h.data, h.partition, true);
    h.background.setActive(true);
    h.frame();
    h.background.update({ ...h.data }, h.partition, true);
    expect(h.reads[0].signal.aborted).toBe(true);
    h.reads[0].resolve(new Float32Array([10, 10, 20, 20]));
    await Promise.resolve();
    expect(h.canvas.dataset.positionReads).toBeUndefined();
    h.frame();
    h.background.dispose();
    expect(h.reads[1].signal.aborted).toBe(true);
    h.reads[1].resolve(new Float32Array([30, 30, 40, 40]));
    await Promise.resolve();
    h.frame();
    expect(h.context.drawImage).not.toHaveBeenCalled();
  });

  it("keeps a failed layer hidden and waits for explicit demand before retrying", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const h = harness();
    h.background.update(h.data, h.partition, true);
    h.background.setActive(true);
    h.frame();
    h.reads[0].reject(new Error("GPU read failed"));
    await Promise.resolve();
    h.background.refresh("simulation");
    h.background.refresh("projection");
    h.frame();
    expect(h.canvas.hidden).toBe(true);
    expect(h.reads).toHaveLength(1);
    h.background.refresh("positions");
    h.frame();
    expect(h.reads).toHaveLength(2);
    h.background.dispose();
  });

  it("does not capture or paint a 3D view", () => {
    const h = harness();
    h.geometry.is3D = true;
    h.background.update(h.data, h.partition, true);
    h.background.setActive(true);
    h.background.refresh("simulation");
    h.frame();
    expect(h.reads).toHaveLength(0);
    expect(h.canvas.hidden).toBe(true);
    h.background.dispose();
  });
});
