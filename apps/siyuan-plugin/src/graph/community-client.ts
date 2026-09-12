import CommunityWorker from "./community.worker?worker";
import type { CommunityRequest, CommunityResponse } from "./community.worker";
import type { PreparedGraph } from "./prepare-graph";

export interface CommunityPartition {
  membership: Uint32Array;
  sizes: Uint32Array;
  count: number;
  calculationMs: number;
}
export interface CommunityWorkerPort {
  onmessage: ((event: MessageEvent<CommunityResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(data: CommunityRequest, transfer: Transferable[]): void;
  terminate(): void;
}

export async function communityEndpoints(data: PreparedGraph, signal: AbortSignal) {
  const indices = new Map(data.indexToNode.map((node, index) => [node.index, index]));
  const endpoints = new Uint32Array(data.indexToEdge.length * 2);
  for (let i = 0; i < data.indexToEdge.length; i++) {
    if (i % 8192 === 0) {
      signal.throwIfAborted();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const edge = data.indexToEdge[i];
    const source = indices.get(edge.source), target = indices.get(edge.target);
    if (source === undefined || target === undefined) throw new Error("社区关系端点与当前图不一致。");
    endpoints[i * 2] = source;
    endpoints[i * 2 + 1] = target;
  }
  signal.throwIfAborted();
  return endpoints;
}

/** Each computation owns a Worker: abort terminates WASM work and frees its memory. */
export function calculateCommunities(
  request: CommunityRequest,
  signal: AbortSignal,
  createWorker: () => CommunityWorkerPort = () => new CommunityWorker(),
): Promise<CommunityPartition> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    let finished = false;
    const cleanup = () => {
      finished = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
    const fail = (error: unknown) => {
      if (finished) return;
      cleanup();
      reject(error);
    };
    const abort = () => fail(new DOMException("Community calculation was replaced", "AbortError"));
    const timeout = setTimeout(() => fail(new Error("社区计算超时，请缩小范围后重试。")), 60_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => fail(new Error(event.message || "社区计算失败。"));
    worker.onmessageerror = () => fail(new Error("无法读取社区计算结果。"));
    worker.onmessage = ({ data }) => {
      if (finished) return;
      if ("error" in data) { fail(new Error(data.error)); return; }
      const { membership, calculationMs } = data;
      if (!(membership instanceof Uint32Array) || membership.length !== request.nodes ||
        membership.some((id) => id >= request.nodes) || !Number.isFinite(calculationMs)) {
        fail(new Error("社区结果与当前图不一致。")); return;
      }
      const sizes = new Uint32Array(request.nodes);
      for (const group of membership) sizes[group]++;
      const count = sizes.reduce((total, size) => total + Number(size > 1), 0);
      cleanup();
      resolve({ membership, sizes, count, calculationMs });
    };
    try { worker.postMessage(request, [request.endpoints.buffer]); }
    catch (error) { fail(error); }
  });
}
