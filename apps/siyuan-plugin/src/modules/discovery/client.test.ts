import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateDiscovery, validDiscoveryResult, type DiscoveryWorkerPort } from "./client";
import { discover } from "./algorithm";
import type { DiscoveryRequest, DiscoveryResult } from "./types";

const request = (): DiscoveryRequest => ({
  nodes: 3,
  endpoints: new Uint32Array([0, 2, 1, 2]),
  seeds: [0],
  rule: "shared-targets",
});
const worker = (): DiscoveryWorkerPort => ({
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null,
  onerror: null,
  onmessageerror: null,
});
afterEach(() => vi.useRealTimers());
describe("discovery worker ownership", () => {
  it("transfers an owned numeric topology without graph bodies or detaching caller inputs", async () => {
    const w = worker(),
      input = request();
    const pending = calculateDiscovery(input, new AbortController().signal, () => w);
    const [payload, buffers] = vi.mocked(w.postMessage).mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(["endpoints", "nodes", "rule", "seeds"]);
    expect(payload.endpoints).toEqual(input.endpoints);
    expect(payload.endpoints.buffer).not.toBe(input.endpoints.buffer);
    expect(buffers).toEqual([payload.endpoints.buffer]);
    const result = discover(input);
    w.onmessage!({ data: { result } } as MessageEvent);
    await expect(pending).resolves.toEqual(result);
    expect(w.terminate).toHaveBeenCalledOnce();
    expect(w.onmessage).toBeNull();
    expect(input.endpoints.byteLength).toBe(16);
  });
  it("terminates replaced work and ignores a captured late response", async () => {
    const w = worker(),
      controller = new AbortController();
    const pending = calculateDiscovery(request(), controller.signal, () => w);
    const late = w.onmessage!;
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    late({ data: { result: discover(request()) } } as MessageEvent);
    await rejection;
    expect(w.terminate).toHaveBeenCalledOnce();
  });
  it.each(["timeout", "error", "unreadable", "malformed", "post"])(
    "cleans up a %s failure",
    async (kind) => {
      vi.useFakeTimers();
      const w = worker();
      if (kind === "post")
        vi.mocked(w.postMessage).mockImplementation(() => {
          throw new Error("transfer failed");
        });
      const pending = calculateDiscovery(request(), new AbortController().signal, () => w);
      const rejection = expect(pending).rejects.toThrow();
      if (kind === "timeout") await vi.advanceTimersByTimeAsync(60_000);
      if (kind === "error") w.onerror!({ message: "worker failed" } as ErrorEvent);
      if (kind === "unreadable") w.onmessageerror!({} as MessageEvent);
      if (kind === "malformed")
        w.onmessage!({
          data: { result: { kind: "candidates", total: 1, candidates: [{ node: 99 }] } },
        } as MessageEvent);
      await rejection;
      expect(w.terminate).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("keeps budget failures localizable and validates evidence against its exact request", async () => {
    const w = worker();
    const pending = calculateDiscovery(request(), new AbortController().signal, () => w);
    w.onmessage!({ data: { error: { code: "discovery.budget" } } } as MessageEvent);
    await expect(pending).rejects.toMatchObject({ detail: { code: "discovery.budget" } });
    const input = { ...request(), candidate: 1 };
    const result = discover(input);
    expect(validDiscoveryResult(result, input)).toBe(true);
    expect(validDiscoveryResult(result, { ...input, candidate: 2 })).toBe(false);
    expect(
      validDiscoveryResult(
        {
          kind: "evidence",
          candidate: 1,
          matches: [{ seed: 0, common: 2, score: 1, supports: [2, 2] }],
        },
        input,
      ),
    ).toBe(false);
    expect(validDiscoveryResult(null as unknown as DiscoveryResult, input)).toBe(false);
  });
});
