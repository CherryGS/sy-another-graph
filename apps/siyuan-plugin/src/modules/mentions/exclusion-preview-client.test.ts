import { describe, expect, it, vi } from "vitest";
import {
  compactMentionNames,
  ExclusionPreviewClient,
  type ExclusionPreviewInput,
  type ExclusionPreviewSnapshot,
  type ExclusionPreviewWorker,
} from "./exclusion-preview-client";
import type {
  ExclusionPreviewRequest,
  ExclusionPreviewResponse,
} from "./exclusion-preview-protocol";
import type { ExclusionPreviewPage } from "./exclusion-preview";
import { EXCLUSION_BUILD_TIMEOUT_MS } from "./exclusions";

class WorkerStub extends EventTarget implements ExclusionPreviewWorker {
  messages: ExclusionPreviewRequest[] = [];
  terminate = vi.fn();
  postMessage(message: ExclusionPreviewRequest) {
    this.messages.push(message);
  }
  emit(message: ExclusionPreviewResponse) {
    this.dispatchEvent(new MessageEvent("message", { data: message }));
  }
}
const input: ExclusionPreviewInput = {
  blocks: [
    { id: "a", rootId: "a", type: "d", title: "01", ial: "", markdown: "body must not be cloned" },
    { id: "p", rootId: "a", type: "p", title: "", ial: "", markdown: "01" },
    { id: "named", rootId: "a", type: "p", title: "", ial: '{: alias="02"}', markdown: "body" },
  ],
  rules: { phrases: [], patterns: ["^\\d{2}$"] },
};
const page: ExclusionPreviewPage = {
  matchedNames: 2,
  matchedNodes: 2,
  totalRows: 2,
  filteredRows: 2,
  offset: 0,
  query: "",
  rows: [],
};

describe("independent preview client", () => {
  it("sends no Markdown, reuses the catalog for edits and rejects old pages", async () => {
    const worker = new WorkerStub();
    const states: ExclusionPreviewSnapshot[] = [];
    const client = new ExclusionPreviewClient(
      () => worker,
      (state) => states.push(state),
    );
    try {
      await client.update(input);
      expect(worker.messages[0]).toEqual({
        kind: "load",
        revision: 1,
        blocks: [
          { id: "a", title: "01", ial: "" },
          { id: "named", title: "", ial: '{: alias="02"}' },
        ],
      });
      worker.emit({ kind: "result", revision: 1, request: 1, pageRequest: 0, page });
      client.page(0, "first");
      client.page(0, "second");
      const count = states.length;
      worker.emit({ kind: "result", revision: 1, request: 1, pageRequest: 1, page });
      expect(states).toHaveLength(count);
      worker.emit({
        kind: "result",
        revision: 1,
        request: 1,
        pageRequest: 2,
        page: { ...page, query: "second" },
      });
      expect(states.at(-1)!.page?.query).toBe("second");
      await client.update({ ...input, rules: { phrases: ["01"], patterns: [] } });
      expect(worker.messages.filter((message) => message.kind === "load")).toHaveLength(1);
      expect(worker.messages.at(-1)).toMatchObject({
        kind: "preview",
        request: 2,
        rules: { phrases: ["01"], patterns: [] },
      });
    } finally {
      client.dispose();
    }
  });

  it("terminates only its own hung task, ignores late responses, and can retry", async () => {
    vi.useFakeTimers();
    const workers: WorkerStub[] = [];
    const states: ExclusionPreviewSnapshot[] = [];
    const client = new ExclusionPreviewClient(
      () => {
        const worker = new WorkerStub();
        workers.push(worker);
        return worker;
      },
      (state) => states.push(state),
    );
    try {
      await client.update(input);
      vi.advanceTimersByTime(EXCLUSION_BUILD_TIMEOUT_MS);
      expect(workers[0].terminate).toHaveBeenCalledOnce();
      expect(states.at(-1)).toMatchObject({
        pending: false,
        page: null,
        error: { code: "mentions.previewTimeout" },
      });
      const count = states.length;
      workers[0].emit({ kind: "result", revision: 1, request: 1, pageRequest: 0, page });
      expect(states).toHaveLength(count);
      await client.update(input);
      expect(workers[1].messages.map((message) => message.kind)).toEqual(["load", "preview"]);
    } finally {
      client.dispose();
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    }
  });

  it("cancels replacement and transfer preparation without publishing an obsolete corpus", async () => {
    vi.useFakeTimers();
    const create = vi.fn(() => new WorkerStub());
    const client = new ExclusionPreviewClient(create, () => {});
    try {
      const pending = client.update({ ...input, blocks: Array(16_384).fill(input.blocks[0]) });
      client.cancel();
      await vi.runAllTimersAsync();
      await pending;
      expect(create).not.toHaveBeenCalled();
      await client.update(input);
      const first = create.mock.results[0].value;
      await client.update({ ...input, rules: { phrases: [], patterns: ["\\D"] } });
      expect(first.terminate).toHaveBeenCalledOnce();
      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.results[1].value.messages[1]).toMatchObject({
        kind: "preview",
        rules: { patterns: ["\\D"] },
      });
    } finally {
      client.dispose();
      vi.useRealTimers();
    }
  });

  it("retains name-bearing blocks but omits source bodies", async () => {
    const controller = new AbortController();
    const compact = await compactMentionNames(input.blocks, controller.signal);
    expect(compact.map((block) => block.id)).toEqual(["a", "named"]);
    expect(compact.every((block) => !("markdown" in block))).toBe(true);
    controller.abort();
    await expect(compactMentionNames(input.blocks, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
