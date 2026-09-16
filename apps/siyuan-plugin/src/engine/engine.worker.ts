import init, { WasmGraph } from "../../wasm/graph_core.js";
import wasmUrl from "../../wasm/graph_core_bg.wasm?url";
import type { EngineRequest, EngineResponse } from "./protocol";
import { copyForTransport, directionCode, transferableBuffers } from "./protocol";
import type { GraphTransport } from "./types";

interface Scope {
  onmessage: ((event: MessageEvent<EngineRequest>) => void) | null;
  postMessage(message: EngineResponse, transfer: Transferable[]): void;
}

const scope = self as unknown as Scope;
let initialization: ReturnType<typeof init> | undefined;
let graph: WasmGraph | undefined;
let revision = 0;
let transport: GraphTransport = "transfer";
let queue = Promise.resolve();

function output(values: Uint32Array): Uint32Array {
  return transport === "shared" ? copyForTransport(values, transport) : values;
}

async function initializeWasm(): ReturnType<typeof init> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Graph WASM download timed out", "TimeoutError")),
    30_000,
  );
  try {
    const response = await fetch(wasmUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`Graph WASM download failed (HTTP ${response.status})`);
    return await init({ module_or_path: response });
  } finally {
    clearTimeout(timeout);
  }
}

async function handle(request: EngineRequest): Promise<void> {
  const identity = { id: request.id, revision: request.revision };
  try {
    if (request.kind === "load") {
      initialization ??= initializeWasm().catch((error: unknown) => {
        initialization = undefined;
        throw error;
      });
      await initialization;
      const next = new WasmGraph();
      const start = performance.now();
      try {
        next.load(request.nodes, request.edges);
      } catch (error) {
        next.free();
        throw error;
      }
      graph?.free();
      graph = next;
      revision = request.revision;
      transport = request.transport;
      const statistics = graph.statistics();
      scope.postMessage(
        {
          ...identity,
          kind: "stats",
          value: {
            nodes: statistics[0],
            edges: statistics[1],
            components: statistics[2],
            largestComponent: statistics[3],
            buildMs: performance.now() - start,
            backend: "Rust WASM · Worker",
            transport,
          },
        },
        [],
      );
      return;
    }
    if (!graph || revision !== request.revision)
      throw new Error("The graph snapshot is unavailable or outdated");
    if (request.kind === "neighborhood") {
      const packed = graph.neighborhood(
        request.seeds,
        directionCode(request.direction),
        request.depth,
        request.limit,
      );
      const indices = output(packed.subarray(1));
      scope.postMessage(
        {
          ...identity,
          kind: "neighborhood",
          value: { indices, truncated: packed[0] !== 0 },
        },
        transferableBuffers(indices),
      );
    } else {
      const indices = output(
        graph.shortest_path(request.source, request.target, directionCode(request.direction)),
      );
      scope.postMessage(
        { ...identity, kind: "path", value: indices },
        transferableBuffers(indices),
      );
    }
  } catch (error) {
    scope.postMessage(
      {
        ...identity,
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      },
      [],
    );
  }
}

scope.onmessage = (event) => {
  // Initialization is async; serialize requests so a query cannot overtake load.
  queue = queue.then(() => handle(event.data));
};
