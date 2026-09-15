import { describe, expect, it, vi } from "vitest";
import { MentionWorkerRuntime } from "./worker-runtime";
import { MentionClient, type MentionInput, type MentionSnapshot, type MentionWorkerPort } from "./client";
import type { MentionRequest, MentionResponse } from "./protocol";
import { EMPTY_MENTION_PROGRESS, type MentionBlock, type MentionScope } from "./types";

const blocks: MentionBlock[] = [
  { id: "a", rootId: "a", type: "d", title: "Alpha", ial: "", markdown: null },
  { id: "b", rootId: "b", type: "d", title: "Beta", ial: "", markdown: null },
  { id: "p", rootId: "a", type: "p", title: "", ial: "", markdown: "Beta" },
];
const scope: MentionScope = { entries: blocks.map((block, index) => ({ id: block.id, displayId: block.id, index })), explicitPairs: [] };
const query = (request: number, mode: "all" | "selected" | "off", chosenIds: string[] = []): MentionRequest => ({ kind: "query", revision: 1, scopeRevision: 1, request, mode, chosenIds });
const results = (events: MentionResponse[]) => events.filter((event): event is Extract<MentionResponse, { kind: "result" }> => event.kind === "result");

describe("mention worker scheduling", () => {
  it("rebuilds exclusions using the retained corpus and publishes only the latest revision", async () => {
    const events: MentionResponse[] = [];
    const runtime = new MentionWorkerRuntime(event => events.push(event));
    runtime.receive({ kind: "load", revision: 1, blocks, excludedPhrases: ["ＢＥＴＡ"] });
    runtime.receive({ kind: "scope", revision: 1, scopeRevision: 1, scope });
    runtime.receive(query(1, "all"));
    await vi.waitFor(() => expect(results(events)).toHaveLength(1));
    expect(results(events)[0].result.edges).toEqual([]);
    runtime.receive({ kind: "exclusions", revision: 2, excludedPhrases: ["beta"] });
    runtime.receive({ kind: "scope", revision: 2, scopeRevision: 1, scope });
    runtime.receive({ ...query(2, "all"), revision: 2 });
    runtime.receive({ kind: "exclusions", revision: 3, excludedPhrases: [] });
    runtime.receive({ kind: "scope", revision: 3, scopeRevision: 1, scope });
    runtime.receive({ ...query(3, "all"), revision: 3 });
    await vi.waitFor(() => expect(results(events).at(-1)?.revision).toBe(3));
    expect(results(events).at(-1)!.result.edges).toHaveLength(1);
    expect(events.some(event => event.revision === 2 && (event.kind === "ready" || event.kind === "result"))).toBe(false);
    runtime.dispose();
  });

  it("warms once and serves both enabled modes from the same cache", async () => {
    const events: MentionResponse[] = [];
    const runtime = new MentionWorkerRuntime(event => events.push(event));
    runtime.receive({ kind: "load", revision: 1, blocks });
    runtime.receive({ kind: "scope", revision: 1, scopeRevision: 1, scope });
    runtime.receive(query(1, "all"));
    await vi.waitFor(() => expect(results(events)).toHaveLength(1));
    const all = results(events)[0].result;
    expect(all.edges).toHaveLength(1);
    runtime.receive(query(2, "selected", ["a"]));
    await vi.waitFor(() => expect(results(events)).toHaveLength(2));
    expect(results(events)[1].result).toEqual(all);
    expect(events.filter(event => event.kind === "ready")).toHaveLength(1);
    runtime.dispose();
  });

  it("honors off during indexing and rejects results for superseded corpus/scope requests", async () => {
    const events: MentionResponse[] = [];
    const runtime = new MentionWorkerRuntime(event => events.push(event));
    runtime.receive({ kind: "load", revision: 1, blocks });
    runtime.receive({ kind: "scope", revision: 1, scopeRevision: 1, scope });
    runtime.receive(query(1, "all"));
    runtime.receive(query(2, "off"));
    await vi.waitFor(() => expect(results(events).some(event => event.request === 2)).toBe(true));
    expect(results(events).every(event => event.request === 2 && event.result.edges.length === 0)).toBe(true);
    runtime.receive({ kind: "load", revision: 2, blocks: blocks.map(block => block.id === "p" ? { ...block, markdown: "No match" } : block) });
    runtime.receive({ kind: "scope", revision: 2, scopeRevision: 1, scope });
    runtime.receive({ ...query(3, "all"), revision: 2 });
    await vi.waitFor(() => expect(results(events).some(event => event.revision === 2)).toBe(true));
    expect(results(events).at(-1)!.result.edges).toEqual([]);
    runtime.receive({ ...query(4, "all"), revision: 1 });
    const length = events.length;
    runtime.dispose();
    runtime.receive({ kind: "load", revision: 3, blocks });
    expect(events).toHaveLength(length);
  });
});

class WorkerStub extends EventTarget implements MentionWorkerPort {
  messages: MentionRequest[] = [];
  terminate = vi.fn();
  postMessage(message: MentionRequest) { this.messages.push(message); }
  emit(message: MentionResponse) { this.dispatchEvent(new MessageEvent("message", { data: message })); }
}

describe("mention client revision boundaries", () => {
  it("sends only changed exclusions, without copying the corpus again or accepting stale matches", () => {
    const worker = new WorkerStub();
    const states: MentionSnapshot[] = [];
    const client = new MentionClient(() => worker, state => states.push(state));
    const input: MentionInput = { blocks, scope, mode: "all", chosenIds: [] };
    client.update(input);
    client.update({ ...input, excludedPhrases: [" Ｂｅｔａ ", "beta"] });
    expect(worker.messages.map(message => message.kind)).toEqual(["load", "scope", "query", "exclusions", "scope", "query"]);
    expect(worker.messages[3]).toEqual({ kind: "exclusions", revision: 2, excludedPhrases: ["beta"] });
    expect(states.at(-1)).toMatchObject({ ready: false, pending: true, result: { edges: [] } });
    const count = states.length;
    worker.emit({ kind: "ready", revision: 1, progress: EMPTY_MENTION_PROGRESS });
    worker.emit({ kind: "result", revision: 1, scopeRevision: 1, request: 1, result: { edges: [], truncated: false, ambiguousEdges: 0 } });
    expect(states).toHaveLength(count);
    client.update({ ...input, excludedPhrases: ["beta"] });
    expect(worker.messages.filter(message => message.kind === "exclusions")).toHaveLength(1);
    client.retry();
    expect(worker.messages.at(-3)).toMatchObject({ kind: "load", blocks, excludedPhrases: ["beta"] });
    client.dispose();
  });

  it("sends the corpus to a fresh worker when exclusions change after an index failure", () => {
    const workers: WorkerStub[] = [];
    const client = new MentionClient(() => { const worker = new WorkerStub(); workers.push(worker); return worker; }, () => {});
    const input: MentionInput = { blocks, scope, mode: "all", chosenIds: [] };
    client.update(input);
    workers[0].dispatchEvent(new Event("error"));
    client.update({ ...input, excludedPhrases: ["beta"] });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers[1].messages[0]).toMatchObject({ kind: "load", blocks, excludedPhrases: ["beta"] });
    client.dispose();
  });

  it("does not reload text for mode/selection changes and rejects late replies at every boundary", () => {
    const worker = new WorkerStub();
    const states: MentionSnapshot[] = [];
    const client = new MentionClient(() => worker, state => states.push(state));
    const input: MentionInput = { blocks, scope, mode: "all", chosenIds: [] };
    client.update(input);
    const result = { edges: [], truncated: false, ambiguousEdges: 0 };
    worker.emit({ kind: "ready", revision: 1, progress: { ...EMPTY_MENTION_PROGRESS, scanned: 1, total: 1 } });
    client.update({ ...input, mode: "selected", chosenIds: ["a"] });
    expect(worker.messages.filter(message => message.kind === "load")).toHaveLength(1);
    expect(worker.messages.filter(message => message.kind === "scope")).toHaveLength(1);
    const count = states.length;
    worker.emit({ kind: "result", revision: 1, scopeRevision: 1, request: 1, result });
    worker.emit({ kind: "result", revision: 1, scopeRevision: 0, request: 2, result });
    worker.emit({ kind: "result", revision: 0, scopeRevision: 1, request: 2, result });
    expect(states).toHaveLength(count);
    worker.emit({ kind: "result", revision: 1, scopeRevision: 1, request: 2, result });
    expect(states.at(-1)!.pending).toBe(false);
    client.update({ ...input, blocks: [...blocks], scope: { ...scope } });
    worker.emit({ kind: "ready", revision: 1, progress: EMPTY_MENTION_PROGRESS });
    expect(states.at(-1)!.ready).toBe(false);
    client.dispose();
    const disposed = states.length;
    worker.emit({ kind: "ready", revision: 2, progress: EMPTY_MENTION_PROGRESS });
    expect(states).toHaveLength(disposed);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("preserves a failed index error across mode changes and retries with a fresh worker", () => {
    const workers: WorkerStub[] = [];
    const states: MentionSnapshot[] = [];
    const client = new MentionClient(() => { const worker = new WorkerStub(); workers.push(worker); return worker; }, state => states.push(state));
    const input: MentionInput = { blocks, scope, mode: "all", chosenIds: [] };
    client.update(input);
    workers[0].dispatchEvent(new Event("error"));
    client.update({ ...input, mode: "selected", chosenIds: ["b"] });
    expect(states.at(-1)!.error).not.toBe("");
    expect(states.at(-1)!.pending).toBe(false);
    client.retry();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers[1].messages.map(message => message.kind)).toEqual(["load", "scope", "query"]);
    expect(states.at(-1)!.error).toBe("");
    expect(states.at(-1)!.ready).toBe(false);
    client.dispose();
  });
});
