import { message as msg, MessageError } from "../../core/diagnostics/message";
import CommunityWorker from "./community.worker.ts?worker";
import type { CommunityRequest, CommunityResponse } from "./protocol";
import type { GraphLike } from "../../core/graph/graph-lookups";

export interface CommunityPartition {
  /** Optional stable keys for explicitly named layout sets. */
  keys?: readonly string[];
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

export async function communityEndpoints(data: GraphLike, signal: AbortSignal) {
  const indices = new Map(data.nodes.map((node, index) => [node.index, index]));
  const endpoints = new Uint32Array(data.edges.length * 2);
  for (let i = 0; i < data.edges.length; i++) {
    if (i % 8192 === 0) {
      signal.throwIfAborted();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const edge = data.edges[i];
    const source = indices.get(edge.source),
      target = indices.get(edge.target);
    if (source === undefined || target === undefined)
      throw new MessageError(msg("text.communityEndpointsDoNotMatchTheCurrentGraph"));
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
    const timeout = setTimeout(
      () => fail(new MessageError(msg("text.communityCalculationTimedOutReduceTheScopeAnd"))),
      60_000,
    );
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) =>
      fail(new MessageError(event.message || msg("text.communityCalculationFailed2")));
    worker.onmessageerror = () =>
      fail(new MessageError(msg("text.cannotReadTheCommunityCalculationResult")));
    worker.onmessage = ({ data }) => {
      if (finished) return;
      if ("error" in data) {
        fail(new Error(data.error));
        return;
      }
      const { membership, calculationMs } = data;
      if (
        !(membership instanceof Uint32Array) ||
        membership.length !== request.nodes ||
        membership.some((id) => id >= request.nodes) ||
        !Number.isFinite(calculationMs)
      ) {
        fail(new MessageError(msg("text.communityResultsDoNotMatchTheCurrentGraph")));
        return;
      }
      const sizes = new Uint32Array(request.nodes);
      for (const group of membership) sizes[group]++;
      const count = sizes.reduce((total, size) => total + Number(size > 1), 0);
      cleanup();
      resolve({ membership, sizes, count, calculationMs });
    };
    try {
      worker.postMessage(request, [request.endpoints.buffer]);
    } catch (error) {
      fail(error);
    }
  });
}
