import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphEngineClient } from "./client";
import type { EngineWorker } from "./client";
import type { EngineRequest, EngineResponse } from "./protocol";
import { copyForTransport, directionCode, transferableBuffers, validateUint32 } from "./protocol";
import type { EngineStats } from "../../application/sessions/graph-engine";

const wasmMock = vi.hoisted(() => ({ initialize: vi.fn() }));

vi.mock("../../../wasm/graph_core.js", () => ({
  default: wasmMock.initialize,
  WasmGraph: class {
    private nodes = 0;
    load(nodes: number): void {
      this.nodes = nodes;
    }
    statistics(): Uint32Array {
      return new Uint32Array([this.nodes, 0, this.nodes, this.nodes ? 1 : 0]);
    }
    free(): void {}
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

class FakeWorker implements EngineWorker {
  messages: EngineRequest[] = [];
  transfers: Transferable[][] = [];
  stopped = false;
  onmessage: EngineWorker["onmessage"] = null;
  onerror: EngineWorker["onerror"] = null;
  onmessageerror: EngineWorker["onmessageerror"] = null;
  postMessage(message: EngineRequest, transfer: Transferable[]): void {
    this.messages.push(message);
    this.transfers.push(transfer);
  }
  terminate(): void {
    this.stopped = true;
  }
  reply(response: EngineResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<EngineResponse>);
  }
}

const stats: EngineStats = {
  nodes: 3,
  edges: 2,
  components: 1,
  largestComponent: 3,
  backend: "Rust WASM · Worker",
  buildMs: 1,
  transport: "transfer",
};

function setup() {
  const workers: FakeWorker[] = [];
  const engine = new GraphEngineClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { engine, workers };
}

async function load(engine: GraphEngineClient, workers: FakeWorker[]) {
  const pending = engine.load(3, new Uint32Array([0, 1, 1, 2]));
  const worker = workers.at(-1)!;
  worker.reply({ ...worker.messages[0], kind: "stats", value: stats });
  await pending;
  return worker;
}

describe("GraphEngineClient ownership and lifecycle", () => {
  it("keeps the renderer input buffer owned by its caller", async () => {
    const { engine, workers } = setup();
    const edges = new Uint32Array([0, 1]);
    const pending = engine.load(2, edges);
    const request = workers[0].messages[0];
    expect(request.kind).toBe("load");
    if (request.kind !== "load") throw new Error("Expected load");
    expect(request.edges).toEqual(edges);
    expect(request.edges.buffer).not.toBe(edges.buffer);
    expect(workers[0].transfers[0]).toContain(request.edges.buffer);
    workers[0].reply({ ...request, kind: "stats", value: stats });
    await expect(pending).resolves.toEqual(stats);
    engine.dispose();
  });

  it("routes results by request ID and never accepts an outdated revision", async () => {
    const { engine, workers } = setup();
    const worker = await load(engine, workers);
    const neighborhood = engine.neighborhood([0], "both", 2, 10);
    const path = engine.shortestPath(0, 2, "out");
    const first = worker.messages[1];
    const second = worker.messages[2];
    worker.reply({
      ...first,
      revision: first.revision - 1,
      kind: "neighborhood",
      value: { indices: new Uint32Array([99]), truncated: false },
    });
    worker.reply({
      ...second,
      kind: "path",
      value: new Uint32Array([0, 1, 2]),
    });
    worker.reply({
      ...first,
      kind: "neighborhood",
      value: { indices: new Uint32Array([0, 1]), truncated: true },
    });
    await expect(path).resolves.toEqual(new Uint32Array([0, 1, 2]));
    await expect(neighborhood).resolves.toEqual({
      indices: new Uint32Array([0, 1]),
      truncated: true,
    });
    engine.dispose();
  });

  it("terminates obsolete work on reload and rejects its pending queries", async () => {
    const { engine, workers } = setup();
    const old = await load(engine, workers);
    const path = engine.shortestPath(0, 2, "both");
    const rejected = expect(path).rejects.toThrow("replaced");
    const reload = engine.load(0, new Uint32Array());
    expect(old.stopped).toBe(true);
    expect(old.onmessage).toBeNull();
    workers[1].reply({
      ...workers[1].messages[0],
      kind: "stats",
      value: stats,
    });
    await rejected;
    await reload;
    engine.dispose();
  });

  it("rejects all waiting requests and future queries on disposal", async () => {
    const { engine, workers } = setup();
    await load(engine, workers);
    const path = engine.shortestPath(0, 2, "both");
    const rejected = expect(path).rejects.toThrow("disposed");
    engine.dispose();
    engine.dispose();
    await rejected;
    expect(workers[0].stopped).toBe(true);
    await expect(engine.load(0, new Uint32Array())).rejects.toThrow("disposed");
  });

  it("surfaces Worker failures and requires reloading before new queries", async () => {
    const { engine, workers } = setup();
    const worker = await load(engine, workers);
    const path = engine.shortestPath(0, 2, "both");
    const rejected = expect(path).rejects.toThrow("WASM failure");
    worker.onerror?.({ message: "WASM failure" } as ErrorEvent);
    await rejected;
    await expect(engine.shortestPath(0, 2, "both")).rejects.toThrow("Load a graph");
    await load(engine, workers);
    engine.dispose();
  });
});

describe("graph transport protocol", () => {
  it("does not put SharedArrayBuffer in a transfer list", () => {
    const source = new Uint32Array([2, 4, 8]);
    const shared = copyForTransport(source, "shared");
    expect(shared.buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(shared).toEqual(source);
    expect(transferableBuffers(shared)).toEqual([]);
    expect(transferableBuffers(source, source)).toEqual([source.buffer]);
  });

  it("rejects inputs that typed-array coercion would silently alter", () => {
    for (const invalid of [-1, 0.1, NaN, Infinity, 0xffff_ffff]) {
      expect(() => validateUint32(invalid, "value")).toThrow(RangeError);
    }
    expect(() => validateUint32(100_000, "value")).not.toThrow();
    expect(directionCode("in")).toBe(1);
    expect(directionCode("out")).toBe(2);
  });
});

async function workerHarness() {
  const responses: EngineResponse[] = [];
  const scope = {
    onmessage: null as ((event: MessageEvent<EngineRequest>) => void) | null,
    postMessage: (response: EngineResponse) => responses.push(response),
  };
  vi.stubGlobal("self", scope);
  vi.resetModules();
  await import("./engine.worker.ts");
  return {
    responses,
    load: (id: number) =>
      scope.onmessage?.({
        data: {
          kind: "load",
          id,
          revision: id,
          nodes: 2,
          edges: new Uint32Array(),
          transport: "transfer",
        },
      } as MessageEvent<EngineRequest>),
  };
}

describe("Worker WASM initialization failure recovery", () => {
  it("times out a stalled download, releases its timer, and retries the next load", async () => {
    vi.useFakeTimers();
    wasmMock.initialize.mockResolvedValue({});
    const fetch = vi.fn(
      (_url: unknown, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
            once: true,
          });
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const worker = await workerHarness();
    worker.load(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(worker.responses[0]).toEqual({
      id: 1,
      revision: 1,
      kind: "error",
      message: "Graph WASM download timed out",
    });
    expect(vi.getTimerCount()).toBe(0);

    fetch.mockResolvedValueOnce(new Response(new Uint8Array(), { status: 200 }));
    worker.load(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(worker.responses[1]).toEqual({
      id: 2,
      revision: 2,
      kind: "stats",
      value: {
        nodes: 2,
        edges: 0,
        components: 2,
        largestComponent: 1,
        buildMs: expect.any(Number),
        backend: "Rust WASM · Worker",
        transport: "transfer",
      },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(wasmMock.initialize).toHaveBeenCalledOnce();
    expect(wasmMock.initialize.mock.calls[0][0].module_or_path).toBeInstanceOf(Response);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports asset HTTP errors without waiting for the timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    const worker = await workerHarness();
    worker.load(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(worker.responses[0]).toEqual({
      id: 1,
      revision: 1,
      kind: "error",
      message: "Graph WASM download failed (HTTP 503)",
    });
    expect(wasmMock.initialize).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
