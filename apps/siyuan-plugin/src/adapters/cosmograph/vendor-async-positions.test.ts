import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cosmograph } from "@cosmograph/cosmograph";

const projectRequire = createRequire(import.meta.url);
const cosmographRequire = createRequire(projectRequire.resolve("@cosmograph/cosmograph"));
const { Graph } = await import(pathToFileURL(cosmographRequire.resolve("@cosmograph/cosmos")).href);

// Run the installed vendor methods, not a copied implementation. The fake GL
// models an offset-only PBO copy whose bytes are unavailable until its fence signals.
const GL = {
  READ_FRAMEBUFFER: 0x8ca8,
  READ_FRAMEBUFFER_BINDING: 0x8caa,
  PIXEL_PACK_BUFFER: 0x88eb,
  PIXEL_PACK_BUFFER_BINDING: 0x88ed,
  PACK_ALIGNMENT: 0x0d05,
  PACK_ROW_LENGTH: 0x0d02,
  PACK_SKIP_ROWS: 0x0d03,
  PACK_SKIP_PIXELS: 0x0d04,
  STREAM_READ: 0x88e1,
  RGBA: 0x1908,
  FLOAT: 0x1406,
  SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
  ALREADY_SIGNALED: 0x911a,
  TIMEOUT_EXPIRED: 0x911b,
  CONDITION_SATISFIED: 0x911c,
  WAIT_FAILED: 0x911d,
};

type Handle = { id: string };
type ReadOptions = { dimensions?: 2 | 3; signal?: AbortSignal };
const cleanups: Array<() => void> = [];

function harness() {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id)),
  );
  vi.stubGlobal("window", { clearTimeout: vi.fn() });
  vi.stubGlobal("document", { getElementById: vi.fn(() => null) });

  const hostFramebuffer = { id: "host-framebuffer" };
  const hostBuffer = { id: "host-pack-buffer" };
  const framebuffer = { width: 2, height: 2, handle: { id: "positions-framebuffer" } };
  const buffers = new Set<Handle>();
  const fences = new Set<Handle>();
  const copies = new Map<Handle, Float32Array>();
  const initialPacking = [
    [GL.PACK_ALIGNMENT, 8],
    [GL.PACK_ROW_LENGTH, 17],
    [GL.PACK_SKIP_ROWS, 2],
    [GL.PACK_SKIP_PIXELS, 3],
  ] as const;
  const packing = new Map<number, number>(initialPacking);
  const pixels = new Float32Array([1, 2, 101, 3, 4, 5, 102, 6, 7, 8, 103, 9, 90, 91, 104, 92]);
  const bindings = {
    framebuffer: hostFramebuffer as Handle | null,
    buffer: hostBuffer as Handle | null,
  };
  let serial = 0;
  let status = GL.TIMEOUT_EXPIRED;
  let lastStatus = GL.TIMEOUT_EXPIRED;
  const gl = {
    ...GL,
    isContextLost: vi.fn(() => false),
    createBuffer: vi.fn((): Handle | null => {
      const buffer = { id: `buffer-${++serial}` };
      buffers.add(buffer);
      return buffer;
    }),
    deleteBuffer: vi.fn((buffer: Handle) => {
      expect(buffers.delete(buffer)).toBe(true);
      copies.delete(buffer);
    }),
    getParameter: vi.fn((parameter: number) => {
      if (parameter === GL.READ_FRAMEBUFFER_BINDING) return bindings.framebuffer;
      if (parameter === GL.PIXEL_PACK_BUFFER_BINDING) return bindings.buffer;
      if (packing.has(parameter)) return packing.get(parameter);
      throw new Error(`Unexpected GL parameter ${parameter}`);
    }),
    pixelStorei: vi.fn((parameter: number, value: number) => {
      expect(packing.has(parameter)).toBe(true);
      packing.set(parameter, value);
    }),
    bindFramebuffer: vi.fn((target: number, value: Handle | null) => {
      expect(target).toBe(GL.READ_FRAMEBUFFER);
      bindings.framebuffer = value;
    }),
    bindBuffer: vi.fn((target: number, value: Handle | null) => {
      expect(target).toBe(GL.PIXEL_PACK_BUFFER);
      bindings.buffer = value;
    }),
    bufferData: vi.fn((target: number, bytes: number, usage: number) => {
      expect([target, usage]).toEqual([GL.PIXEL_PACK_BUFFER, GL.STREAM_READ]);
      expect(buffers.has(bindings.buffer!)).toBe(true);
      expect(bytes).toBe(
        framebuffer.width * framebuffer.height * 4 * Float32Array.BYTES_PER_ELEMENT,
      );
    }),
    readPixels: vi.fn(
      (
        x: number,
        y: number,
        width: number,
        height: number,
        format: number,
        type: number,
        offset: unknown,
      ) => {
        expect([x, y, width, height, format, type]).toEqual([
          0,
          0,
          framebuffer.width,
          framebuffer.height,
          GL.RGBA,
          GL.FLOAT,
        ]);
        expect(offset).toBe(0);
        expect(bindings.framebuffer).toBe(framebuffer.handle);
        expect(buffers.has(bindings.buffer!)).toBe(true);
        expect([...packing.values()]).toEqual([4, 0, 0, 0]);
        copies.set(bindings.buffer!, pixels.slice());
        lastStatus = GL.TIMEOUT_EXPIRED;
      },
    ),
    fenceSync: vi.fn((condition: number, flags: number): Handle | null => {
      expect([condition, flags]).toEqual([GL.SYNC_GPU_COMMANDS_COMPLETE, 0]);
      const fence = { id: `fence-${++serial}` };
      fences.add(fence);
      return fence;
    }),
    clientWaitSync: vi.fn((fence: Handle, flags: number, timeout: number) => {
      expect(fences.has(fence)).toBe(true);
      expect([flags, timeout]).toEqual([0, 0]);
      lastStatus = status;
      return status;
    }),
    deleteSync: vi.fn((fence: Handle) => {
      expect(fences.delete(fence)).toBe(true);
    }),
    flush: vi.fn(),
    getBufferSubData: vi.fn((target: number, offset: number, destination: Float32Array) => {
      expect([target, offset]).toEqual([GL.PIXEL_PACK_BUFFER, 0]);
      expect([GL.ALREADY_SIGNALED, GL.CONDITION_SATISFIED]).toContain(lastStatus);
      expect(buffers.has(bindings.buffer!)).toBe(true);
      destination.set(copies.get(bindings.buffer!)!);
    }),
  };
  const absent = new Set<number>();
  const context = Object.setPrototypeOf(
    {
      _isDestroyed: false,
      isReady: true,
      isPointPositionsUpdateNeeded: false,
      device: { gl },
      graph: {
        pointsNumber: 3,
        pointPositions: new Float32Array([1, 2, 4, 5, 7, 8]),
        inputPointPositions: undefined as Float32Array | undefined,
        isPointAbsent: (index: number) => absent.has(index),
      },
      points: { currentPositionFbo: framebuffer, updatePinnedStatus: vi.fn(), destroy: vi.fn() },
      store: { spaceDimensions: 2, screenSize: [0, 0] },
      camera: { canvasSelection: undefined },
      transition: { abort: vi.fn() },
      ensureDevice: vi.fn(() => false),
      requestRender: vi.fn(),
      initPrograms: vi.fn(),
      handOffFramingTo3D: vi.fn(() => true),
      handOffFramingTo2D: vi.fn(),
      maybeInitializeCamera: vi.fn(),
      updateZoomDragBehaviors: vi.fn(),
      cancelLongPress: vi.fn(),
      stopFrames: vi.fn(),
      getPointPositions: vi.fn(() => {
        throw new Error("Synchronous readback is forbidden");
      }),
    },
    Graph.prototype,
  );
  const dispose = () =>
    Reflect.apply(Graph.prototype._cancelPointPositionsReadback, context, [true]);
  cleanups.push(dispose);
  return {
    context,
    gl,
    frames,
    buffers,
    fences,
    bindings,
    framebuffer,
    pixels,
    absent,
    packing,
    initialPacking,
    hostFramebuffer,
    hostBuffer,
    dispose,
    read(options: ReadOptions = {}): Promise<Float32Array> {
      const promise = Reflect.apply(Graph.prototype.getPointPositionsAsync, context, [
        options,
      ]) as Promise<Float32Array>;
      // Cleanup can reject a pending request after an earlier assertion failed.
      // The original promise is still returned and asserted by every test.
      void promise.catch(() => {});
      return promise;
    },
    frame(nextStatus = GL.TIMEOUT_EXPIRED) {
      status = nextStatus;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(16 * nextFrame);
    },
    expectBindings(framebufferBinding = hostFramebuffer, bufferBinding = hostBuffer) {
      expect(bindings.framebuffer).toBe(framebufferBinding);
      expect(bindings.buffer).toBe(bufferBinding);
      expect([...packing]).toEqual(initialPacking);
    },
  };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Cosmos asynchronous point-position snapshots", () => {
  it("shares one fenced RGBA read across subscribers while returning owned XY/XYZ arrays", async () => {
    const h = harness();
    const xy = h.read();
    const xyz = h.read({ dimensions: 3 });
    const otherXY = h.read({ dimensions: 2 });
    expect(h.gl.readPixels).toHaveBeenCalledTimes(1);
    expect(h.frames.size).toBe(1);
    h.expectBindings();
    for (let index = 0; index < 3; index++) {
      h.frame();
      expect(h.gl.getBufferSubData).not.toHaveBeenCalled();
      expect(h.frames.size).toBe(1);
      expect(h.fences.size).toBe(1);
    }
    const nextFramebuffer = { id: "next-host-framebuffer" };
    const nextBuffer = { id: "next-host-pack-buffer" };
    h.bindings.framebuffer = nextFramebuffer;
    h.bindings.buffer = nextBuffer;
    h.frame(GL.ALREADY_SIGNALED);
    const [a, b, c] = await Promise.all([xy, xyz, otherXY]);
    expect([...a]).toEqual([1, 2, 4, 5, 7, 8]);
    expect([...b]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...c]).toEqual([...a]);
    expect(a.buffer).not.toBe(c.buffer);
    a[0] = 999;
    expect(c[0]).toBe(1);
    expect(b[0]).toBe(1);
    h.expectBindings(nextFramebuffer, nextBuffer);
    expect(h.gl.getBufferSubData).toHaveBeenCalledTimes(1);
    expect(h.frames.size).toBe(0);
    expect(h.fences.size).toBe(0);
    h.pixels[0] = 20;
    const later = h.read();
    h.frame(GL.CONDITION_SATISFIED);
    expect((await later)[0]).toBe(20);
    expect(c[0]).toBe(1);
    expect(h.gl.readPixels).toHaveBeenCalledTimes(2);
    expect(h.context.getPointPositions).not.toHaveBeenCalled();
  });

  it("preserves absent points as NaN and takes Z from alpha rather than the blue channel", async () => {
    const h = harness();
    h.absent.add(1);
    const xy = h.read();
    const xyz = h.read({ dimensions: 3 });
    h.frame(GL.CONDITION_SATISFIED);
    expect([...(await xy)]).toEqual([1, 2, NaN, NaN, 7, 8]);
    expect([...(await xyz)]).toEqual([1, 2, 3, NaN, NaN, NaN, 7, 8, 9]);
  });

  it("cancels one consumer independently and does not let a pre-aborted caller cancel another", async () => {
    const h = harness();
    const first = new AbortController();
    const second = new AbortController();
    const removeFirst = vi.spyOn(first.signal, "removeEventListener");
    const removeSecond = vi.spyOn(second.signal, "removeEventListener");
    const cancelled = h.read({ signal: first.signal });
    const retained = h.read({ dimensions: 3, signal: second.signal });
    const rejection = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    first.abort();
    await rejection;
    expect(h.frames.size).toBe(1);
    expect(h.fences.size).toBe(1);
    await expect(h.read({ signal: first.signal })).rejects.toMatchObject({ name: "AbortError" });
    h.frame(GL.CONDITION_SATISFIED);
    expect([...(await retained)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(h.gl.readPixels).toHaveBeenCalledTimes(1);
    expect(removeFirst).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(removeSecond).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(h.frames.size).toBe(0);
    expect(h.fences.size).toBe(0);
  });

  it("keeps at most one pending capture and stops it when every subscriber aborts", async () => {
    const h = harness();
    const controllers = Array.from({ length: 30 }, () => new AbortController());
    const results = controllers.map((controller) =>
      h.read({ signal: controller.signal }).catch((error: Error) => error.name),
    );
    expect(h.gl.readPixels).toHaveBeenCalledTimes(1);
    expect(h.frames.size).toBe(1);
    for (const controller of controllers) controller.abort();
    expect(await Promise.all(results)).toEqual(Array.from({ length: 30 }, () => "AbortError"));
    expect(h.frames.size).toBe(0);
    expect(h.fences.size).toBe(0);
    h.frame(GL.CONDITION_SATISFIED);
    expect(h.gl.getBufferSubData).not.toHaveBeenCalled();
    const next = h.read();
    h.frame(GL.CONDITION_SATISFIED);
    expect([...(await next)]).toEqual([1, 2, 4, 5, 7, 8]);
    expect(h.gl.readPixels).toHaveBeenCalledTimes(2);
  });

  it.each(["readPixels", "clientWaitSync", "getBufferSubData"] as const)(
    "restores caller bindings and rejects without retry after %s throws",
    async (operation) => {
      const h = harness();
      const failure = new Error(`${operation} failed`);
      h.gl[operation].mockImplementationOnce(() => {
        throw failure;
      });
      const pending = h.read();
      const rejected = expect(pending).rejects.toBe(failure);
      if (operation !== "readPixels") {
        h.bindings.framebuffer = { id: "poll-framebuffer" };
        h.bindings.buffer = { id: "poll-pack-buffer" };
      } else h.expectBindings();
      const before = { ...h.bindings };
      h.frame(GL.CONDITION_SATISFIED);
      await rejected;
      expect(h.bindings).toEqual(before);
      expect([...h.packing]).toEqual(h.initialPacking);
      expect(h.frames.size).toBe(0);
      expect(h.fences.size).toBe(0);
      expect(h.gl.readPixels).toHaveBeenCalledTimes(1);
      expect(h.context.getPointPositions).not.toHaveBeenCalled();
      h.dispose();
      expect(h.buffers.size).toBe(0);
    },
  );

  it.each(["buffer", "fence"] as const)(
    "rejects unavailable %s allocation without synchronous fallback",
    async (resource) => {
      const h = harness();
      if (resource === "buffer") h.gl.createBuffer.mockReturnValueOnce(null);
      else h.gl.fenceSync.mockReturnValueOnce(null);
      await expect(h.read()).rejects.toThrow(/scheduled|unavailable/i);
      h.expectBindings();
      expect(h.frames.size).toBe(0);
      expect(h.fences.size).toBe(0);
      expect(h.gl.getBufferSubData).not.toHaveBeenCalled();
      expect(h.context.getPointPositions).not.toHaveBeenCalled();
      h.dispose();
      expect(h.buffers.size).toBe(0);
    },
  );

  it.each(["fence failure", "context loss"] as const)(
    "rejects every subscriber on %s and cancels polling",
    async (failure) => {
      const h = harness();
      const first = h.read();
      const second = h.read({ dimensions: 3 });
      const rejections = [
        expect(first).rejects.toThrow(/fence|context/i),
        expect(second).rejects.toThrow(/fence|context/i),
      ];
      if (failure === "context loss") h.gl.isContextLost.mockReturnValue(true);
      h.frame(failure === "fence failure" ? GL.WAIT_FAILED : GL.CONDITION_SATISFIED);
      await Promise.all(rejections);
      h.expectBindings();
      expect(h.gl.getBufferSubData).not.toHaveBeenCalled();
      expect(h.frames.size).toBe(0);
      expect(h.fences.size).toBe(0);
      expect(h.gl.readPixels).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["device", "points", "count", "committed positions", "pending positions"] as const)(
    "rejects a stale %s owner before copying a completed buffer",
    async (changed) => {
      const h = harness();
      const first = h.read();
      const second = h.read({ dimensions: 3 });
      const rejections = [
        expect(first).rejects.toMatchObject({ name: "AbortError" }),
        expect(second).rejects.toMatchObject({ name: "AbortError" }),
      ];
      if (changed === "device") h.context.device = { gl: h.gl };
      else if (changed === "points") h.context.points = { ...h.context.points };
      else if (changed === "count") h.context.graph.pointsNumber = 4;
      else if (changed === "committed positions")
        h.context.graph.pointPositions = h.context.graph.pointPositions.slice();
      else h.context.graph.inputPointPositions = new Float32Array([20, 30, 40, 50, 60, 70]);
      h.frame(GL.CONDITION_SATISFIED);
      await Promise.all(rejections);
      expect(h.gl.getBufferSubData).not.toHaveBeenCalled();
      expect(h.frames.size).toBe(0);
      expect(h.fences.size).toBe(0);
    },
  );

  it("allows ordinary simulation framebuffer swaps while the captured source revision stays current", async () => {
    const h = harness();
    const pending = h.read({ dimensions: 3 });
    h.context.points.currentPositionFbo = {
      ...h.framebuffer,
      handle: { id: "next-simulation-framebuffer" },
    };
    h.frame(GL.CONDITION_SATISFIED);
    expect([...(await pending)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(h.gl.readPixels).toHaveBeenCalledTimes(1);
    expect(h.gl.getBufferSubData).toHaveBeenCalledTimes(1);
    h.expectBindings();
  });

  it("cancels subscribers whenever positions are marked dirty independently of the public setter", async () => {
    const h = harness();
    const pending = h.read();
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    Reflect.apply(Graph.prototype.markPointPositionsDirty, h.context, []);
    await rejected;
    expect(h.context.isPointPositionsUpdateNeeded).toBe(true);
    expect(h.frames.size).toBe(0);
    expect(h.fences.size).toBe(0);
    expect(h.gl.getBufferSubData).not.toHaveBeenCalled();
  });

  it("invalidates pending snapshots through the actual source-position setter", async () => {
    const h = harness();
    const pending = h.read();
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    Reflect.apply(Graph.prototype.setPointPositions, h.context, [
      new Float32Array([20, 30, 40, 50, 60, 70]),
      { dimensions: 2 },
    ]);
    await rejected;
    expect(h.context.isPointPositionsUpdateNeeded).toBe(true);
    await expect(h.read()).rejects.toMatchObject({ name: "AbortError" });
    expect(h.frames.size).toBe(0);
    expect(h.fences.size).toBe(0);
    expect(h.gl.getBufferSubData).not.toHaveBeenCalled();
  });

  it("invalidates a shared pre-pin snapshot before a new consumer captures the pinned coordinates", async () => {
    const h = harness();
    const before = h.read();
    const shared = h.read({ dimensions: 3 });
    const rejections = [
      expect(before).rejects.toMatchObject({ name: "AbortError" }),
      expect(shared).rejects.toMatchObject({ name: "AbortError" }),
    ];
    const pinned = [1];
    Reflect.apply(Graph.prototype.setPinnedPoints, h.context, [pinned]);
    await Promise.all(rejections);
    expect(Reflect.get(h.context.graph, "inputPinnedPoints")).toBe(pinned);
    expect(h.context.points.updatePinnedStatus).toHaveBeenCalledTimes(1);
    expect(h.frames.size).toBe(0);
    expect(h.fences.size).toBe(0);
    expect(h.gl.getBufferSubData).not.toHaveBeenCalled();
    h.pixels.set([40, 50, 102, 60], 4);
    const after = h.read({ dimensions: 3 });
    expect(h.gl.readPixels).toHaveBeenCalledTimes(2);
    h.frame(GL.CONDITION_SATISFIED);
    expect([...(await after)]).toEqual([1, 2, 3, 40, 50, 60, 7, 8, 9]);
    expect(h.frames.size).toBe(0);
    expect(h.context.getPointPositions).not.toHaveBeenCalled();
  });

  it.each(["pause", "stop", "end", "disable"] as const)(
    "cancels pre-stop shared captures before %s callbacks request the final coordinates",
    async (operation) => {
      const h = harness();
      const simulation = Object.assign(h.context.store, {
        isSimulationRunning: true,
        alpha: 0.2,
        simulationProgress: 0.4,
      });
      let final: Promise<Float32Array> | undefined;
      const onStopped = vi.fn(() => {
        expect(simulation.isSimulationRunning).toBe(false);
        expect(h.fences.size).toBe(0);
        expect(h.frames.size).toBe(0);
        expect(h.gl.getBufferSubData).not.toHaveBeenCalled();
        h.expectBindings();
        // This consumer had no earlier request of its own. It must not join
        // another label layer's capture from before the simulation stopped.
        final = h.read({ dimensions: 3 });
      });
      const context = Object.assign(h.context, {
        config: {
          enableSimulation: operation !== "disable",
          onSimulationPause: onStopped,
          onSimulationEnd: onStopped,
        },
        destroySimulationModules: vi.fn(),
      });
      const earlier = h.read();
      const shared = h.read({ dimensions: 3 });
      const rejections = [
        expect(earlier).rejects.toMatchObject({ name: "AbortError" }),
        expect(shared).rejects.toMatchObject({ name: "AbortError" }),
      ];
      expect(h.gl.readPixels).toHaveBeenCalledTimes(1);
      h.pixels.set([40, 50, 102, 60], 4);
      if (operation === "disable")
        Reflect.apply(Graph.prototype.applyEnableSimulationConfigChange, context, [
          { enableSimulation: true },
        ]);
      else Reflect.apply(Graph.prototype[operation], context, []);
      await Promise.all(rejections);
      expect(onStopped).toHaveBeenCalledTimes(1);
      expect(final).toBeDefined();
      expect(h.gl.readPixels).toHaveBeenCalledTimes(2);
      expect(h.gl.deleteSync).toHaveBeenCalledTimes(1);
      expect(h.fences.size).toBe(1);
      expect(h.frames.size).toBe(1);
      h.frame(GL.CONDITION_SATISFIED);
      expect([...(await final!)]).toEqual([1, 2, 3, 40, 50, 60, 7, 8, 9]);
      expect(h.gl.getBufferSubData).toHaveBeenCalledTimes(1);
      expect(h.frames.size).toBe(0);
      expect(h.fences.size).toBe(0);
      expect(context.getPointPositions).not.toHaveBeenCalled();
      if (operation === "disable")
        expect(context.destroySimulationModules).toHaveBeenCalledTimes(1);
      h.expectBindings();
    },
  );

  it("invalidates every subscriber when the actual dimension setter changes the view", async () => {
    const h = harness();
    const first = h.read();
    const second = h.read({ dimensions: 3 });
    const rejections = [
      expect(first).rejects.toMatchObject({ name: "AbortError" }),
      expect(second).rejects.toMatchObject({ name: "AbortError" }),
    ];
    Reflect.apply(Graph.prototype.setSpaceDimensions, h.context, [3]);
    await Promise.all(rejections);
    expect(h.context.store.spaceDimensions).toBe(3);
    expect(h.frames.size).toBe(0);
    expect(h.fences.size).toBe(0);
    expect(h.gl.getBufferSubData).not.toHaveBeenCalled();
    expect(h.context.getPointPositions).not.toHaveBeenCalled();
  });

  it("releases the old PBO when the framebuffer size changes and serves a fresh snapshot", async () => {
    const h = harness();
    const stale = h.read();
    const rejected = expect(stale).rejects.toMatchObject({ name: "AbortError" });
    h.framebuffer.width = 4;
    const current = h.read();
    await rejected;
    expect(h.gl.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(h.buffers.size).toBe(1);
    expect(h.frames.size).toBe(1);
    h.frame(GL.CONDITION_SATISFIED);
    expect([...(await current)]).toEqual([1, 2, 4, 5, 7, 8]);
    expect(h.gl.readPixels).toHaveBeenCalledTimes(2);
  });

  it("destroys pending jobs and all GPU resources through the actual destroy method", async () => {
    const h = harness();
    const first = h.read();
    const second = h.read({ dimensions: 3 });
    const rejections = [
      expect(first).rejects.toMatchObject({ name: "AbortError" }),
      expect(second).rejects.toMatchObject({ name: "AbortError" }),
    ];
    Reflect.apply(Graph.prototype.destroy, h.context, []);
    await Promise.all(rejections);
    expect(h.context._isDestroyed).toBe(true);
    expect(h.frames.size).toBe(0);
    expect(h.fences.size).toBe(0);
    expect(h.buffers.size).toBe(0);
    expect(h.gl.deleteSync).toHaveBeenCalledTimes(1);
    expect(h.gl.deleteBuffer).toHaveBeenCalledTimes(1);
    await expect(h.read()).rejects.toMatchObject({ name: "AbortError" });
    Reflect.apply(Graph.prototype.destroy, h.context, []);
    expect(h.gl.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(h.gl.getBufferSubData).not.toHaveBeenCalled();
  });
});

describe("public Cosmograph asynchronous position bridge", () => {
  it("forwards the original options and source promise without substituting synchronous readback", async () => {
    const options = { dimensions: 3 as const, signal: new AbortController().signal };
    const values = new Float32Array([1, 2, 3]);
    const promise = Promise.resolve(values);
    const source = {
      getPointPositionsAsync: vi.fn((_options?: ReadOptions) => promise),
      getPointPositions: vi.fn(() => {
        throw new Error("Synchronous readback is forbidden");
      }),
    };
    const returned = Reflect.apply(
      Cosmograph.prototype.getPointPositionsAsync,
      { _cosmos: source },
      [options],
    );
    expect(returned).toBe(promise);
    expect(await returned).toBe(values);
    expect(source.getPointPositionsAsync).toHaveBeenCalledExactlyOnceWith(options);
    expect(source.getPointPositionsAsync.mock.calls[0][0]).toBe(options);
    expect(source.getPointPositions).not.toHaveBeenCalled();
  });

  it("resolves an empty typed array before a Cosmos source exists", async () => {
    const returned = Reflect.apply(Cosmograph.prototype.getPointPositionsAsync, {}, [
      { dimensions: 3 },
    ]);
    const values = await returned;
    expect(values).toBeInstanceOf(Float32Array);
    expect(values).toHaveLength(0);
  });

  it("rejects a pre-aborted signal before calling the source", async () => {
    const controller = new AbortController();
    controller.abort();
    const source = {
      getPointPositionsAsync: vi.fn(() => Promise.resolve(new Float32Array([1, 2]))),
    };
    const returned = Reflect.apply(
      Cosmograph.prototype.getPointPositionsAsync,
      { _cosmos: source },
      [{ signal: controller.signal }],
    );
    await expect(returned).rejects.toMatchObject({ name: "AbortError" });
    expect(source.getPointPositionsAsync).not.toHaveBeenCalled();
  });
});
