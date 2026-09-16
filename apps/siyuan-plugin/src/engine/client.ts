import GraphWorkerConstructor from "./engine.worker?worker";
import type { EngineRequest, EngineResponse } from "./protocol";
import {
  copyForTransport,
  directionCode,
  supportsSharedTransport,
  transferableBuffers,
  validateUint32,
} from "./protocol";
import type { EngineStats, GraphDirection, GraphEngine, Neighborhood } from "./types";

export type { EngineStats, GraphDirection, GraphEngine, Neighborhood } from "./types";

export function createGraphEngine(): GraphEngine {
  return new GraphEngineClient(() => new GraphWorkerConstructor());
}

export interface EngineWorker {
  postMessage(message: EngineRequest, transfer: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<EngineResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
}

interface PendingRequest {
  revision: number;
  resolve: (response: EngineResponse) => void;
  reject: (reason: Error) => void;
}

type RequestBody = EngineRequest extends infer R
  ? R extends EngineRequest
    ? Omit<R, "id" | "revision">
    : never
  : never;

/** Each replacement snapshot owns a Worker; reloading also cancels old compute. */
export class GraphEngineClient implements GraphEngine {
  private worker: EngineWorker | undefined;
  private readonly createWorker: () => EngineWorker;
  private revision = 0;
  private sequence = 0;
  private loaded = false;
  private disposed = false;
  private pending = new Map<number, PendingRequest>();

  constructor(createWorker: () => EngineWorker) {
    this.createWorker = createWorker;
  }

  async load(nodeCount: number, edges: Uint32Array): Promise<EngineStats> {
    this.assertOpen();
    validateUint32(nodeCount, "Node count");
    if (!(edges instanceof Uint32Array) || edges.length % 2 !== 0) {
      throw new TypeError("Edges must be a Uint32Array of source/target pairs");
    }
    this.loaded = false;
    this.revision += 1;
    const revision = this.revision;
    this.stopWorker(new Error("The graph snapshot was replaced"));
    const worker = this.createWorker();
    this.worker = worker;
    worker.onmessage = (event) => this.receive(event.data);
    worker.onerror = (event) => this.stopWorker(new Error(event.message || "Graph worker failed"));
    worker.onmessageerror = () =>
      this.stopWorker(new Error("Graph worker returned an unreadable response"));
    const transport = supportsSharedTransport() ? "shared" : "transfer";
    // Do not detach the caller's renderer topology when sending to the Worker.
    const ownedEdges = copyForTransport(edges, transport);
    const response = await this.request(
      { kind: "load", nodes: nodeCount, edges: ownedEdges, transport },
      transferableBuffers(ownedEdges),
    );
    if (response.kind !== "stats") throw new Error("Unexpected graph load response");
    if (revision !== this.revision) throw new Error("The graph snapshot was replaced");
    this.loaded = true;
    return response.value;
  }

  async neighborhood(
    seeds: number[],
    direction: GraphDirection,
    depth: number,
    limit: number,
  ): Promise<Neighborhood> {
    this.assertLoaded();
    directionCode(direction);
    validateUint32(depth, "Depth");
    validateUint32(limit, "Node limit");
    for (const seed of seeds) validateUint32(seed, "Seed");
    const indices = Uint32Array.from(seeds);
    const response = await this.request(
      { kind: "neighborhood", seeds: indices, direction, depth, limit },
      transferableBuffers(indices),
    );
    if (response.kind !== "neighborhood") throw new Error("Unexpected neighborhood response");
    return response.value;
  }

  async shortestPath(
    source: number,
    target: number,
    direction: GraphDirection,
  ): Promise<Uint32Array> {
    this.assertLoaded();
    validateUint32(source, "Source");
    validateUint32(target, "Target");
    directionCode(direction);
    const response = await this.request({
      kind: "path",
      source,
      target,
      direction,
    });
    if (response.kind !== "path") throw new Error("Unexpected shortest path response");
    return response.value;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopWorker(new Error("The graph engine was disposed"));
  }

  private request(body: RequestBody, transfer: Transferable[] = []): Promise<EngineResponse> {
    const id = ++this.sequence;
    const revision = this.revision;
    return new Promise((resolve, reject) => {
      const worker = this.worker;
      if (!worker) {
        reject(new Error("Graph worker is unavailable"));
        return;
      }
      this.pending.set(id, { revision, resolve, reject });
      try {
        worker.postMessage({ ...body, id, revision }, transfer);
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private receive(response: EngineResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    // A mismatched response must never resolve a request against a newer graph.
    if (response.revision !== pending.revision || response.revision !== this.revision) return;
    this.pending.delete(response.id);
    if (response.kind === "error") pending.reject(new Error(response.message));
    else pending.resolve(response);
  }

  private stopWorker(reason: Error): void {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
      this.worker = undefined;
    }
    this.loaded = false;
    for (const pending of this.pending.values()) pending.reject(reason);
    this.pending.clear();
  }

  private assertOpen(): void {
    if (this.disposed) throw new Error("The graph engine was disposed");
  }

  private assertLoaded(): void {
    this.assertOpen();
    if (!this.loaded) throw new Error("Load a graph before querying it");
  }
}
