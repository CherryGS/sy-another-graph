import { describe, expect, it, vi } from "vitest";
import {
  compactExclusionSource,
  CONTENT_EXCLUSION_TIMEOUT_MS,
  resolveContentExclusions,
  type ContentExclusionWorker,
} from "./client";
import type { ContentExclusionRequest, ContentExclusionResponse } from "./protocol";
import type { GraphLike } from "../../core/graph/graph-lookups";

class WorkerStub extends EventTarget implements ContentExclusionWorker {
  messages: ContentExclusionRequest[] = [];
  terminate = vi.fn();
  postMessage(message: ContentExclusionRequest) {
    this.messages.push(message);
  }
  emit(message: ContentExclusionResponse) {
    this.dispatchEvent(new MessageEvent("message", { data: message }));
  }
}
const data: GraphLike = {
  nodes: [
    {
      id: "doc",
      index: 0,
      label: "Document",
      content: "2026-09",
      path: "",
      notebook: "",
      blockType: "d",
    },
  ],
  edges: [],
};
const rules = [{ kind: "regex" as const, value: "^\\d{4}-\\d{2}$", scope: "document" as const }];
const result = { ids: ["doc"], matchedRoots: 1, documents: 1, blocks: 0 };

describe("bounded content exclusion tasks", () => {
  it("returns exact worker results and terminates completed tasks", async () => {
    const worker = new WorkerStub();
    const pending = resolveContentExclusions(
      data,
      rules,
      new AbortController().signal,
      () => worker,
    );
    await Promise.resolve();
    expect(worker.messages[0].source.nodes[0].label).toBe("2026-09");
    worker.emit({ kind: "result", result });
    expect(await pending).toEqual(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminates a hung regex, ignores late messages, and allows a fresh retry", async () => {
    vi.useFakeTimers();
    try {
      const worker = new WorkerStub();
      const pending = resolveContentExclusions(
        data,
        rules,
        new AbortController().signal,
        () => worker,
      );
      const failure = expect(pending).rejects.toMatchObject({
        detail: { code: "contentExclusions.timeout" },
      });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(CONTENT_EXCLUSION_TIMEOUT_MS);
      await failure;
      expect(worker.terminate).toHaveBeenCalledOnce();
      worker.emit({ kind: "result", result });
      const replacement = new WorkerStub();
      const retry = resolveContentExclusions(
        data,
        rules,
        new AbortController().signal,
        () => replacement,
      );
      await Promise.resolve();
      replacement.emit({ kind: "result", result });
      expect(await retry).toEqual(result);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("isolates applied and preview tasks and aborts only the obsolete source/rules", async () => {
    const appliedWorker = new WorkerStub();
    const previewWorker = new WorkerStub();
    const controller = new AbortController();
    const applied = resolveContentExclusions(
      data,
      rules,
      new AbortController().signal,
      () => appliedWorker,
    );
    const preview = resolveContentExclusions(data, rules, controller.signal, () => previewWorker);
    const canceled = expect(preview).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await canceled;
    expect(previewWorker.terminate).toHaveBeenCalledOnce();
    expect(appliedWorker.terminate).not.toHaveBeenCalled();
    previewWorker.emit({ kind: "result", result: { ...result, ids: ["obsolete"] } });
    appliedWorker.emit({ kind: "result", result });
    expect(await applied).toEqual(result);
  });

  it("cancels chunked preparation before a worker can be created", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const create = vi.fn(() => new WorkerStub());
      const pending = resolveContentExclusions(
        { nodes: Array(16384).fill(data.nodes[0]), edges: [] },
        rules,
        controller.signal,
        create,
      );
      const canceled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      controller.abort();
      await vi.runAllTimersAsync();
      await canceled;
      expect(create).not.toHaveBeenCalled();
      await expect(compactExclusionSource(data, controller.signal)).rejects.toMatchObject({
        name: "AbortError",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["error", "messageerror"])("cleans up after worker %s", async (type) => {
    const worker = new WorkerStub();
    const pending = resolveContentExclusions(
      data,
      rules,
      new AbortController().signal,
      () => worker,
    );
    const failure = expect(pending).rejects.toMatchObject({
      detail: { code: "contentExclusions.failed" },
    });
    await Promise.resolve();
    worker.dispatchEvent(new Event(type));
    await failure;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
