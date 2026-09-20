import { message, MessageError } from "../../core/diagnostics/message";
import type { GraphLike } from "../../core/graph/graph-lookups";
import type { GraphEdge, GraphNode } from "../../core/graph/types";
import { isBlock, nodeType } from "../../core/scope/filter-types";
import type { ContentExclusionRule } from "./rules";
import type { ContentExclusionResult } from "./matcher";
import type { ContentExclusionRequest, ContentExclusionResponse } from "./protocol";

export const CONTENT_EXCLUSION_TIMEOUT_MS = 10_000;
export interface ContentExclusionWorker {
  postMessage(message: ContentExclusionRequest): void;
  addEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  removeEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  terminate(): void;
}

/** Retain native containment and full document titles, omit bodies and references. */
export async function compactExclusionSource(
  data: GraphLike,
  signal: AbortSignal,
): Promise<GraphLike> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (let offset = 0; offset < data.nodes.length; offset += 8192) {
    signal.throwIfAborted();
    for (const node of data.nodes.slice(offset, offset + 8192)) {
      if (!isBlock(node)) continue;
      nodes.push({
        id: node.id,
        index: node.index,
        entity: "block",
        blockType: node.blockType,
        label: nodeType(node) === "d" ? (node.content ?? node.label) : "",
        rootId: node.rootId,
        parentId: node.parentId,
        notebook: "",
        path: "",
      });
    }
    if (offset + 8192 < data.nodes.length)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  for (let offset = 0; offset < data.edges.length; offset += 16384) {
    signal.throwIfAborted();
    for (const edge of data.edges.slice(offset, offset + 16384))
      if (edge.kind === "hierarchy")
        edges.push({ source: edge.source, target: edge.target, kind: "hierarchy", weight: 1 });
    if (offset + 16384 < data.edges.length)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  signal.throwIfAborted();
  return { nodes, edges };
}

/** One worker per request makes abort, timeout and stale-source disposal exact. */
export async function resolveContentExclusions(
  source: GraphLike,
  rules: readonly ContentExclusionRule[],
  signal: AbortSignal,
  create: () => ContentExclusionWorker,
): Promise<ContentExclusionResult> {
  const compact = await compactExclusionSource(source, signal);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = create();
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onError);
      worker.terminate();
    };
    const fail = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(signal.reason);
    const onError: EventListener = () =>
      fail(new MessageError(message("contentExclusions.failed")));
    const onMessage: EventListener = (event) => {
      const response = (event as MessageEvent<ContentExclusionResponse>).data;
      if (response.kind === "error") fail(new MessageError(response.error));
      else {
        cleanup();
        resolve(response.result);
      }
    };
    const timer = setTimeout(
      () =>
        fail(
          new MessageError(
            message("contentExclusions.timeout", { seconds: CONTENT_EXCLUSION_TIMEOUT_MS / 1000 }),
          ),
        ),
      CONTENT_EXCLUSION_TIMEOUT_MS,
    );
    signal.addEventListener("abort", onAbort, { once: true });
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", onError);
    try {
      worker.postMessage({ source: compact, rules });
    } catch (error) {
      fail(error);
    }
  });
}
