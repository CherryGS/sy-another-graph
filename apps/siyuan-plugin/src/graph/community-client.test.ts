import { describe, expect, it, vi } from "vitest";
import {
  calculateCommunities,
  communityEndpoints,
  type CommunityWorkerPort,
} from "./community-client";
import type { PreparedGraph } from "./prepare-graph";

function worker(): CommunityWorkerPort {
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  };
}
const request = () => ({ nodes: 4, endpoints: new Uint32Array([0, 1, 2, 3]), resolution: 1 });

describe("community computation lifetime", () => {
  it("releases the worker after a validated result and excludes singleton groups from aggregation", async () => {
    const w = worker();
    const result = calculateCommunities(request(), new AbortController().signal, () => w);
    w.onmessage!({
      data: { membership: new Uint32Array([0, 0, 2, 3]), calculationMs: 2 },
    } as MessageEvent);
    expect(await result).toMatchObject({ count: 1, sizes: new Uint32Array([2, 0, 1, 1]) });
    expect(w.terminate).toHaveBeenCalledOnce();
    expect(w.onmessage).toBeNull();
  });

  it("terminates obsolete computation and rejects a late captured callback", async () => {
    const w = worker(),
      controller = new AbortController();
    const promise = calculateCommunities(request(), controller.signal, () => w);
    const late = w.onmessage!;
    const rejection = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    late({ data: { membership: new Uint32Array([0, 0, 2, 2]), calculationMs: 3 } } as MessageEvent);
    await rejection;
    expect(w.terminate).toHaveBeenCalledOnce();
  });

  it("rejects malformed membership instead of mapping it onto the displayed nodes", async () => {
    const w = worker();
    const promise = calculateCommunities(request(), new AbortController().signal, () => w);
    w.onmessage!({
      data: { membership: new Uint32Array([0, 0, 9, 9]), calculationMs: 2 },
    } as MessageEvent);
    await expect(promise).rejects.toThrow("当前图");
    expect(w.terminate).toHaveBeenCalledOnce();
  });

  it("terminates a stalled worker when its time budget expires", async () => {
    vi.useFakeTimers();
    try {
      const w = worker();
      const promise = calculateCommunities(request(), new AbortController().signal, () => w);
      const rejected = expect(promise).rejects.toThrow("超时");
      await vi.advanceTimersByTimeAsync(60_000);
      await rejected;
      expect(w.terminate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps source indices through the current displayed order and rejects excluded endpoints", async () => {
    const data = {
      indexToNode: [{ index: 80 }, { index: 10 }],
      indexToEdge: [{ source: 10, target: 80 }],
    } as unknown as PreparedGraph;
    expect(await communityEndpoints(data, new AbortController().signal)).toEqual(
      new Uint32Array([1, 0]),
    );
    await expect(
      communityEndpoints(
        { ...data, indexToNode: data.indexToNode.slice(0, 1) },
        new AbortController().signal,
      ),
    ).rejects.toThrow("端点");
  });
});
