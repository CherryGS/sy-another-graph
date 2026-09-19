import DiscoveryWorker from "./discovery.worker.ts?worker";
import { isFailure, MessageError, message } from "../../core/diagnostics/message";
import { DISCOVERY_LIMITS, type DiscoveryRequest, type DiscoveryResult } from "./types";

export interface DiscoveryWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(value: DiscoveryRequest, transfer: Transferable[]): void;
  terminate(): void;
}

export function validDiscoveryResult(result: DiscoveryResult, request: DiscoveryRequest): boolean {
  if (!result || typeof result !== "object") return false;
  const index = (n: number) => Number.isInteger(n) && n >= 0 && n < request.nodes;
  const count = (n: number) => Number.isSafeInteger(n) && n >= 0;
  const score = (n: number) => Number.isFinite(n) && n > 0 && n <= 1 + Number.EPSILON * 16;
  const seeds = new Set(request.seeds);
  if (request.candidate === undefined)
    return (
      result.kind === "candidates" &&
      count(result.total) &&
      result.total <= request.nodes &&
      Array.isArray(result.candidates) &&
      result.candidates.length <= DISCOVERY_LIMITS.candidates &&
      result.candidates.length <= result.total &&
      new Set(result.candidates.map((item) => item?.node)).size === result.candidates.length &&
      result.candidates.every(
        (item) =>
          item &&
          index(item.node) &&
          !seeds.has(item.node) &&
          seeds.has(item.bestSeed) &&
          score(item.score) &&
          count(item.common) &&
          item.common > 0 &&
          item.common <= request.nodes &&
          count(item.matchedSeeds) &&
          item.matchedSeeds > 0 &&
          item.matchedSeeds <= seeds.size,
      )
    );
  return (
    result.kind === "evidence" &&
    result.candidate === request.candidate &&
    Array.isArray(result.matches) &&
    result.matches.length <= seeds.size &&
    new Set(result.matches.map((item) => item?.seed)).size === result.matches.length &&
    result.matches.every(
      (item) =>
        item &&
        seeds.has(item.seed) &&
        score(item.score) &&
        count(item.common) &&
        item.common > 0 &&
        item.common <= request.nodes &&
        Array.isArray(item.supports) &&
        item.supports.length === Math.min(item.common, DISCOVERY_LIMITS.supports) &&
        item.supports.every(index) &&
        new Set(item.supports).size === item.supports.length,
    )
  );
}

/** Own one bounded query and Worker, with no note content/provenance transport. */
export function calculateDiscovery(
  request: DiscoveryRequest,
  signal: AbortSignal,
  createWorker: () => DiscoveryWorkerPort = () => new DiscoveryWorker(),
): Promise<DiscoveryResult> {
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
      if (!finished) {
        cleanup();
        reject(error);
      }
    };
    const abort = () => fail(new DOMException("Discovery request replaced", "AbortError"));
    const timeout = setTimeout(() => fail(new MessageError(message("discovery.timeout"))), 60_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => fail(new Error(event.message));
    worker.onmessageerror = () => fail(new MessageError(message("discovery.invalidResult")));
    worker.onmessage = ({ data }) => {
      if (finished) return;
      if (data && typeof data === "object" && "error" in data && isFailure(data.error)) {
        fail(new MessageError(data.error));
        return;
      }
      const result =
        data && typeof data === "object" && "result" in data
          ? (data.result as DiscoveryResult)
          : null;
      if (!result || !validDiscoveryResult(result, request)) {
        fail(new MessageError(message("discovery.invalidResult")));
        return;
      }
      cleanup();
      resolve(result);
    };
    try {
      const endpoints = new Uint32Array(request.endpoints);
      worker.postMessage({ ...request, endpoints }, [endpoints.buffer]);
    } catch (error) {
      fail(error);
    }
  });
}
