import { describe, expect, it, vi } from "vitest";
import {
  compactSetNodes,
  resolveSetMembership,
  SET_MATCH_TIMEOUT_MS,
  type SetMatchWorker,
} from "./client";
import { matchLayoutSets } from "./matcher";
import type { SetMatchRequest, SetMatchResponse } from "./protocol";
import type { GraphNode } from "../../core/graph/types";
import type { LayoutSet } from "./model";

class WorkerStub extends EventTarget implements SetMatchWorker {
  messages: SetMatchRequest[] = [];
  terminate = vi.fn();
  postMessage(value: SetMatchRequest) {
    this.messages.push(value);
  }
  emit(value: SetMatchResponse) {
    this.dispatchEvent(new MessageEvent("message", { data: value }));
  }
  finish() {
    this.emit({
      kind: "result",
      result: matchLayoutSets(this.messages[0].nodes, this.messages[0].sets),
    });
  }
}
const nodes: GraphNode[] = [
  {
    id: "doc",
    label: "clipped",
    content: "Full document title",
    blockType: "d",
    index: 1,
    notebook: "",
    path: "",
  },
];
const sets: LayoutSet[] = [
  { id: "a", name: "A", enabled: true, rules: [{ kind: "text", value: "full document" }] },
];

describe("bounded set matching tasks", () => {
  it("sends full document titles and only each non-document node's own label, without source bodies", async () => {
    const source = [
      ...nodes,
      {
        ...nodes[0],
        id: "paragraph",
        blockType: "p",
        label: "Paragraph title",
        content: "Large body not used for matching",
      },
    ];
    const compact = await compactSetNodes(source, new AbortController().signal);
    expect(compact).toEqual([
      { id: "doc", title: "Full document title" },
      { id: "paragraph", title: "Paragraph title" },
    ]);
    const worker = new WorkerStub();
    const pending = resolveSetMembership(source, sets, new AbortController().signal, () => worker);
    await Promise.resolve();
    worker.finish();
    expect([...(await pending).sizes]).toEqual([1]);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("terminates obsolete rules and prevents late responses from replacing a new priority order", async () => {
    const old = new WorkerStub(),
      current = new WorkerStub(),
      controller = new AbortController();
    const oldTask = resolveSetMembership(nodes, sets, controller.signal, () => old);
    const canceled = expect(oldTask).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await canceled;
    const next = resolveSetMembership(
      nodes,
      [{ ...sets[0], enabled: false }],
      new AbortController().signal,
      () => current,
    );
    await Promise.resolve();
    old.finish();
    current.finish();
    expect([...(await next).sizes]).toEqual([0]);
    expect(old.terminate).toHaveBeenCalledOnce();
    expect(current.terminate).toHaveBeenCalledOnce();
  });
  it("times out a hung regex and allows matching again after disabling it", async () => {
    vi.useFakeTimers();
    try {
      const worker = new WorkerStub();
      const pending = resolveSetMembership(nodes, sets, new AbortController().signal, () => worker);
      const failure = expect(pending).rejects.toMatchObject({
        detail: { code: "grouping.timeout" },
      });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(SET_MATCH_TIMEOUT_MS);
      await failure;
      const replacement = new WorkerStub();
      const next = resolveSetMembership(
        nodes,
        [{ ...sets[0], enabled: false }],
        new AbortController().signal,
        () => replacement,
      );
      await Promise.resolve();
      replacement.finish();
      expect([...(await next).sizes]).toEqual([0]);
      expect(vi.getTimerCount()).toBe(0);
      expect(worker.terminate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
  it("cancels chunked source preparation before spawning a worker", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController(),
        create = vi.fn(() => new WorkerStub());
      const pending = resolveSetMembership(
        Array(16384).fill(nodes[0]),
        sets,
        controller.signal,
        create,
      );
      const failure = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      controller.abort();
      await vi.runAllTimersAsync();
      await failure;
      expect(create).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it.each(["error", "messageerror"])("cleans up after %s", async (type) => {
    const worker = new WorkerStub();
    const pending = resolveSetMembership(nodes, sets, new AbortController().signal, () => worker);
    const failure = expect(pending).rejects.toMatchObject({ detail: { code: "grouping.failed" } });
    await Promise.resolve();
    worker.dispatchEvent(new Event(type));
    await failure;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
