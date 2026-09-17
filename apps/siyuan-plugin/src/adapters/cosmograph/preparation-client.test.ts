import { afterEach, describe, expect, it, vi } from "vitest";
import { tableFromIPC } from "apache-arrow";
import { GraphPreparationClient, PREPARATION_TIMEOUT_MS } from "./preparation-client";
import { encodeGraph } from "./encode-graph";
import { prepareGraph } from "./prepare-graph";
import type { GraphColumns, PreparationRequest, PreparationResponse } from "./preparation-protocol";

function columns(): GraphColumns {
  return {
    points: {
      id: ["a"],
      label: ["A&B"],
      notebook: ["book"],
      color: ["#123456"],
      branchColor: ["#123456"],
      degreeColor: ["#123456"],
      typeColor: ["#123456"],
      degree: new Float32Array([1]),
      accentedIndices: new Uint32Array([0]),
    },
    links: {
      sourceIndex: new Uint32Array([0]),
      targetIndex: new Uint32Array([0]),
      colorIndex: new Uint8Array([0]),
      weight: new Float32Array([1]),
      width: new Float32Array([1.55]),
      style: new Uint8Array([0]),
    },
  };
}
class WorkerStub extends EventTarget {
  requests: PreparationRequest[] = [];
  terminate = vi.fn();
  postMessage = vi.fn((request: PreparationRequest, transfer: ArrayBuffer[]) => {
    this.requests.push(structuredClone(request, { transfer }));
  });
  reply(response: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data: response }));
  }
  complete(): void {
    const request = this.requests.at(-1)!;
    this.reply({
      kind: "prepared",
      request: request.request,
      pointsCount: request.columns.points.id.length,
      linksCount: request.columns.links.sourceIndex.length,
      ipc: encodeGraph(request.columns),
    } satisfies PreparationResponse);
  }
}
const clients: GraphPreparationClient[] = [];
function harness() {
  const workers: WorkerStub[] = [];
  const create = vi.fn(() => {
    const worker = new WorkerStub();
    workers.push(worker);
    return worker;
  });
  const client = new GraphPreparationClient(create);
  clients.push(client);
  return { client, create, workers };
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.dispose());
  vi.useRealTimers();
});

describe("renderer preparation worker ownership", () => {
  it("starts lazily, transfers owned buffers and reuses an encoder after success", async () => {
    const h = harness(),
      input = columns();
    expect(h.create).not.toHaveBeenCalled();
    const first = h.client.encode(input, new AbortController().signal);
    expect(input.points.degree.byteLength).toBe(0);
    expect(input.links.weight.byteLength).toBe(0);
    h.workers[0].complete();
    const ipc = await first;
    expect(tableFromIPC(ipc.points).getChild("label")!.get(0)).toBe("A&amp;B");
    expect(tableFromIPC(ipc.links).numRows).toBe(1);
    const second = h.client.encode(columns(), new AbortController().signal);
    h.workers[0].complete();
    await second;
    expect(h.create).toHaveBeenCalledOnce();
    h.client.dispose();
    expect(h.workers[0].terminate).toHaveBeenCalledOnce();
  });

  it("keeps exact input and provenance identities without sending their source payloads", async () => {
    const h = harness();
    const node = {
      id: "a",
      index: 12,
      label: "A",
      notebook: "book",
      path: "/doc.sy",
      color: "#123456",
      degree: 1,
      content: "PRIVATE_BODY",
    };
    const edge = {
      source: 12,
      target: 12,
      kind: "reference" as const,
      weight: 1,
      provenance: [
        { sourceId: "PRIVATE_EVIDENCE", targetId: "a", kind: "reference" as const, weight: 1 },
      ],
    };
    const nodes = [node],
      edges = [edge];
    const pending = prepareGraph(nodes, edges, new AbortController().signal, h.client.encode);
    await vi.waitFor(() => expect(h.workers).toHaveLength(1));
    expect(JSON.stringify(h.workers[0].requests[0])).not.toMatch(
      /PRIVATE_BODY|PRIVATE_EVIDENCE|provenance/,
    );
    h.workers[0].complete();
    const result = await pending;
    expect(result.indexToNode).toBe(nodes);
    expect(result.indexToEdge[0]).toBe(edge);
    expect(node.degree).toBe(1);
    expect(result.indexToId).toEqual(["a"]);
  });

  it("terminates a cancelled task and ignores its late result before recovering", async () => {
    const h = harness(),
      controller = new AbortController();
    const pending = h.client.encode(columns(), controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(h.workers[0].terminate).toHaveBeenCalledOnce();
    const next = h.client.encode(columns(), new AbortController().signal);
    h.workers[0].complete();
    h.workers[1].complete();
    await expect(next).resolves.toHaveProperty("points");
  });

  it("supersedes a busy task instead of queuing behind its synchronous encoding", async () => {
    const h = harness();
    const first = h.client.encode(columns(), new AbortController().signal);
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = h.client.encode(columns(), new AbortController().signal);
    await rejected;
    expect(h.workers[0].terminate).toHaveBeenCalledOnce();
    expect(h.workers[1].requests[0].request).not.toBe(h.workers[0].requests[0].request);
    h.workers[1].complete();
    await second;
  });

  it.each(["error", "messageerror"])(
    "recovers after worker %s, including while idle",
    async (event) => {
      const h = harness();
      const first = h.client.encode(columns(), new AbortController().signal);
      const rejected = expect(first).rejects.toThrow("graph.preparationFailed");
      h.workers[0].dispatchEvent(new Event(event));
      await rejected;
      const second = h.client.encode(columns(), new AbortController().signal);
      h.workers[1].complete();
      await second;
      h.workers[1].dispatchEvent(new Event(event));
      const third = h.client.encode(columns(), new AbortController().signal);
      h.workers[2].complete();
      await third;
      expect(h.workers[1].terminate).toHaveBeenCalledOnce();
    },
  );

  it("times out a nonresponding worker and clears the deadline after success", async () => {
    vi.useFakeTimers();
    const h = harness();
    const pending = h.client.encode(columns(), new AbortController().signal);
    const rejected = expect(pending).rejects.toThrow("graph.preparationTimeout");
    await vi.advanceTimersByTimeAsync(PREPARATION_TIMEOUT_MS);
    await rejected;
    const next = h.client.encode(columns(), new AbortController().signal);
    h.workers[1].complete();
    await next;
    await vi.advanceTimersByTimeAsync(PREPARATION_TIMEOUT_MS);
    expect(h.workers[1].terminate).not.toHaveBeenCalled();
  });

  it("rejects count mismatches and malformed current results", async () => {
    const h = harness();
    for (const invalid of [null, { kind: "prepared", pointsCount: 2, linksCount: 1, ipc: {} }]) {
      const pending = h.client.encode(columns(), new AbortController().signal);
      const rejected = expect(pending).rejects.toThrow("graph.preparationFailed");
      const worker = h.workers.at(-1)!;
      worker.reply(invalid ? { ...invalid, request: worker.requests[0].request } : invalid);
      await rejected;
      expect(worker.terminate).toHaveBeenCalledOnce();
    }
  });

  it("ignores stale request IDs and preserves structured worker failures", async () => {
    const h = harness();
    const pending = h.client.encode(columns(), new AbortController().signal);
    const worker = h.workers[0];
    worker.reply({ kind: "error", request: 0, error: "obsolete" });
    expect(worker.terminate).not.toHaveBeenCalled();
    const rejected = expect(pending).rejects.toMatchObject({
      detail: { code: "graph.preparationFailed" },
    });
    worker.reply({
      kind: "error",
      request: worker.requests[0].request,
      error: { code: "graph.preparationFailed" },
    });
    await rejected;
  });

  it("cleans up constructor and transfer failures and allows another attempt", async () => {
    const h = harness();
    h.create.mockImplementationOnce(() => {
      throw new Error("Worker blocked");
    });
    await expect(h.client.encode(columns(), new AbortController().signal)).rejects.toThrow(
      "Worker blocked",
    );
    h.create.mockImplementationOnce(() => {
      const worker = new WorkerStub();
      h.workers.push(worker);
      worker.postMessage.mockImplementation(() => {
        throw new Error("Transfer failed");
      });
      return worker;
    });
    await expect(h.client.encode(columns(), new AbortController().signal)).rejects.toThrow(
      "Transfer failed",
    );
    expect(h.workers[0].terminate).toHaveBeenCalledOnce();
    const next = h.client.encode(columns(), new AbortController().signal);
    h.workers[1].complete();
    await next;
  });

  it("does not allocate for an aborted signal and disposes pending work permanently", async () => {
    const h = harness(),
      controller = new AbortController();
    controller.abort();
    await expect(h.client.encode(columns(), controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(h.create).not.toHaveBeenCalled();
    const pending = h.client.encode(columns(), new AbortController().signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    h.client.dispose();
    await rejected;
    await expect(h.client.encode(columns(), new AbortController().signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(h.workers[0].terminate).toHaveBeenCalledOnce();
  });
});
