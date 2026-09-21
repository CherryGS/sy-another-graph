import { message, MessageError } from "../../core/diagnostics/message";
import type { GraphNode } from "../../core/graph/types";
import type { GraphLike } from "../../core/graph/graph-lookups";
import type { LayoutSet } from "./model";
import { UNGROUPED, type MatchNode, type SetMembership } from "./matcher";
import type { SetMatchRequest, SetMatchResponse } from "./protocol";
import { compactSetSource } from "./source";

export const SET_MATCH_TIMEOUT_MS = 10_000;
export interface SetMatchWorker {
  postMessage(value: SetMatchRequest): void;
  addEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  removeEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  terminate(): void;
}

/** Copy titles only, using full document titles rather than their clipped canvas labels. */
export async function compactSetNodes(
  nodes: readonly GraphNode[],
  signal: AbortSignal,
): Promise<MatchNode[]> {
  const result: MatchNode[] = [];
  for (let offset = 0; offset < nodes.length; offset += 8192) {
    signal.throwIfAborted();
    for (const node of nodes.slice(offset, offset + 8192))
      result.push({
        id: node.id,
        title: node.blockType === "d" ? (node.content ?? node.label) : node.label,
      });
    if (offset + 8192 < nodes.length) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  signal.throwIfAborted();
  return result;
}

export async function resolveSetMembership(
  nodes: readonly GraphNode[],
  sets: readonly LayoutSet[],
  signal: AbortSignal,
  create: () => SetMatchWorker,
  source?: GraphLike | null,
): Promise<SetMembership> {
  const compact = await compactSetNodes(nodes, signal);
  const containment =
    source && sets.some((set) => set.enabled && set.rules.some((rule) => rule.kind === "id"))
      ? await compactSetSource(source, signal)
      : undefined;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = create();
    let finished = false;
    const cleanup = () => {
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onError);
      worker.terminate();
    };
    const fail = (error: unknown) => {
      if (!finished) {
        cleanup();
        reject(error);
      }
    };
    const onAbort = () => fail(signal.reason);
    const onError = () => fail(new MessageError(message("grouping.failed")));
    const onMessage: EventListener = (event) => {
      if (finished) return;
      const response = (event as MessageEvent<SetMatchResponse>).data;
      if (!response || (response.kind !== "error" && response.kind !== "result")) {
        onError();
        return;
      }
      if (response.kind === "error") {
        fail(new MessageError(response.error));
        return;
      }
      const result = response.result;
      if (
        !result ||
        !(result.membership instanceof Uint32Array) ||
        result.membership.length !== nodes.length ||
        !(result.sizes instanceof Uint32Array) ||
        result.sizes.length !== sets.length ||
        !(result.matches instanceof Uint32Array) ||
        result.matches.length !== sets.length ||
        !Array.isArray(result.keys) ||
        result.keys.length !== sets.length ||
        result.keys.some((key, index) => key !== sets[index].id) ||
        !Number.isFinite(result.calculationMs) ||
        result.calculationMs < 0 ||
        result.count !== result.sizes.reduce((count, size) => count + Number(size > 1), 0) ||
        result.sizes.some(
          (size, index) =>
            size > result.matches[index] ||
            result.matches[index] > nodes.length ||
            (!sets[index].enabled && size > 0),
        ) ||
        result.membership.some((group) => group !== UNGROUPED && group >= sets.length)
      ) {
        onError();
        return;
      }
      cleanup();
      resolve(result);
    };
    const timer = setTimeout(
      () =>
        fail(
          new MessageError(message("grouping.timeout", { seconds: SET_MATCH_TIMEOUT_MS / 1000 })),
        ),
      SET_MATCH_TIMEOUT_MS,
    );
    signal.addEventListener("abort", onAbort, { once: true });
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", onError);
    try {
      worker.postMessage({ nodes: compact, sets, source: containment });
    } catch (error) {
      fail(error);
    }
  });
}
