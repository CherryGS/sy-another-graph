import { afterEach, describe, expect, it, vi } from "vitest";
import { createPresetStore, type PresetStore } from "../presets/model";
import type { PresetResponse } from "../presets/host-protocol";
import { PRESET_STORAGE_FILE, PresetStorage } from "./preset-storage";

const missing = Symbol("missing");
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function settle() {
  for (let index = 0; index < 40; index++) await Promise.resolve();
}

function harness(initial: unknown = missing, useNativeFetch = false) {
  let disk = initial;
  const origin = "http://127.0.0.1:6806";
  const responses: PresetResponse[] = [];
  const waiters = new Map<string, (response: PresetResponse) => void>();
  const source = { postMessage: vi.fn((response: PresetResponse) => {
    responses.push(response);
    waiters.get(response.request)?.(response);
    waiters.delete(response.request);
  }) };
  const port = {
    loadData: vi.fn(async (): Promise<unknown> => disk === missing ? "" : disk),
    saveData: vi.fn(async (_name: string, store: PresetStore): Promise<unknown> => { disk = store; return { code: 0 }; }),
  };
  const fetcher = vi.fn(async () => disk === missing
    ? new Response(JSON.stringify({ code: 404, msg: "file does not exist" }), { status: 202 })
    : new Response(JSON.stringify(disk), { status: 200 }));
  const bridge = new PresetStorage(port, event => event.source === (source as unknown as Window), origin, useNativeFetch ? undefined : fetcher);
  const send = (data: Record<string, unknown>, event: Record<string, unknown> = {}) => bridge.handle({
    source, origin, data: { channel: "sy-another-graph", ...data }, ...event,
  } as unknown as MessageEvent);
  let sequence = 0;
  const request = (type = "preset-load", store?: unknown) => {
    const id = `request-${++sequence}`;
    return new Promise<PresetResponse>(resolve => {
      waiters.set(id, resolve);
      send({ type, request: id, store });
    });
  };
  return { bridge, port, fetcher, source, responses, request, send, setDisk: (value: unknown) => { disk = value; } };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("host preset storage", () => {
  it("invokes the native default fetch without binding it to the storage adapter", async () => {
    const store = createPresetStore();
    const nativeFetch = vi.fn(async function(this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return new Response(JSON.stringify(store), { status: 200 });
    });
    vi.stubGlobal("fetch", nativeFetch);
    const h = harness(store, true);
    expect(await h.request()).toMatchObject({ ok: true, store });
    expect(nativeFetch).toHaveBeenCalledOnce();
    h.bridge.dispose();
  });

  it("loads missing/default/existing data through the fixed plugin file and correlates responses", async () => {
    const h = harness();
    expect(await h.request()).toMatchObject({ request: "request-1", ok: true, store: null });
    expect(h.port.loadData).toHaveBeenCalledWith(PRESET_STORAGE_FILE);
    expect(h.fetcher).toHaveBeenCalledWith("/api/file/getFile", expect.objectContaining({
      method: "POST", body: JSON.stringify({ path: "/data/storage/petal/sy-another-graph/filter-presets.json" }),
    }));
    const store = createPresetStore();
    expect(await h.request("preset-save", store)).toMatchObject({ request: "request-2", ok: true, store });
    expect(h.port.saveData).toHaveBeenCalledWith(PRESET_STORAGE_FILE, store);
    expect(await h.request()).toMatchObject({ request: "request-3", ok: true, store });
    expect(h.source.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: "preset-response" }), "http://127.0.0.1:6806");
    h.bridge.dispose();
  });

  it("rejects wrong sources, origins, channels, invalid requests, and invalid writes", async () => {
    const h = harness();
    const load = { type: "preset-load", request: "request" };
    for (const event of [{ source: {} }, { origin: "https://foreign.example" }]) expect(h.send(load, event)).toBe(false);
    for (const data of [{ ...load, channel: "other" }, { ...load, request: "../file" }, { ...load, request: "a".repeat(129) }, { ...load, type: "other" }]) expect(h.send(data)).toBe(false);
    expect(h.port.loadData).not.toHaveBeenCalled();
    expect(h.responses).toEqual([]);
    expect(await h.request("preset-save", { version: 42 })).toMatchObject({ ok: false });
    expect(await h.request("preset-save", createPresetStore())).toMatchObject({ ok: false });
    expect(h.port.saveData).not.toHaveBeenCalled();
    h.bridge.dispose();
  });

  it("preserves malformed files and detects failures that loadData hides as empty/cached data", async () => {
    const h = harness({ version: 42 });
    h.port.loadData.mockResolvedValue("");
    expect(await h.request()).toMatchObject({ ok: false, error: expect.stringContaining("原文件已保留") });
    h.setDisk(createPresetStore());
    expect(await h.request()).toMatchObject({ ok: true });
    h.setDisk({ broken: true });
    expect(await h.request("preset-save", createPresetStore())).toMatchObject({ ok: false });
    expect(h.port.saveData).not.toHaveBeenCalled();
    h.fetcher.mockResolvedValueOnce(new Response("{ malformed", { status: 200 }));
    expect(await h.request()).toMatchObject({ ok: false, error: expect.stringContaining("JSON") });
    h.fetcher.mockRejectedValueOnce(new Error("offline"));
    expect(await h.request()).toMatchObject({ ok: false, error: "offline" });
    h.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ code: 403, msg: "forbidden" }), { status: 202 }));
    expect(await h.request()).toMatchObject({ ok: false, error: expect.stringContaining("forbidden") });
    h.fetcher.mockResolvedValueOnce(new Response("missing route", { status: 404 }));
    expect(await h.request()).toMatchObject({ ok: false });
    h.bridge.dispose();
  });

  it("serializes writes and subsequent reads, and recovers from definitive save errors", async () => {
    const h = harness(createPresetStore());
    await h.request();
    const first = deferred<unknown>();
    h.port.saveData.mockReturnValueOnce(first.promise);
    const initialStore = createPresetStore();
    const nextStore = { ...initialStore, activePresetId: null };
    const firstResponse = h.request("preset-save", initialStore);
    const nextResponse = h.request("preset-save", nextStore);
    const lastRead = h.request();
    await settle();
    expect(h.port.saveData).toHaveBeenCalledTimes(1);
    expect(h.port.loadData).toHaveBeenCalledTimes(1);
    first.reject({ code: 403, msg: "readonly" });
    expect(await firstResponse).toMatchObject({ ok: false, error: "readonly" });
    expect(await nextResponse).toMatchObject({ ok: true, store: nextStore });
    expect(await lastRead).toMatchObject({ ok: true, store: nextStore });
    h.port.saveData.mockResolvedValueOnce({ code: -1, msg: "disk full" });
    expect(await h.request("preset-save", initialStore)).toMatchObject({ ok: false, error: expect.stringContaining("disk full") });
    expect(await h.request("preset-save", initialStore)).toMatchObject({ ok: true });
    h.bridge.dispose();
  });

  it("reports timed out writes without letting later writes overlap or sending a late success", async () => {
    vi.useFakeTimers();
    const h = harness(createPresetStore());
    await h.request();
    const first = deferred<unknown>();
    h.port.saveData.mockReturnValueOnce(first.promise);
    const response = h.request("preset-save", createPresetStore());
    const expiredQueued = h.request("preset-save", createPresetStore());
    await settle();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await response).toMatchObject({ ok: false });
    expect(await expiredQueued).toMatchObject({ ok: false });
    expect(h.port.saveData).toHaveBeenCalledTimes(1);
    first.resolve({ code: 0 });
    await settle();
    expect(h.responses.filter(item => item.request === "request-2")).toHaveLength(1);
    expect(h.port.saveData).toHaveBeenCalledTimes(1);
    expect(await h.request("preset-save", createPresetStore())).toMatchObject({ ok: true });
    h.bridge.dispose();
  });

  it("suppresses outstanding replies and queued operations on plugin unload", async () => {
    vi.useFakeTimers();
    const h = harness(createPresetStore());
    await h.request();
    const first = deferred<unknown>();
    h.port.saveData.mockReturnValueOnce(first.promise);
    h.send({ type: "preset-save", request: "first", store: createPresetStore() });
    h.send({ type: "preset-save", request: "next", store: createPresetStore() });
    await settle();
    h.bridge.dispose();
    first.resolve({ code: 0 });
    await settle();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(h.port.saveData).toHaveBeenCalledTimes(1);
    expect(h.responses).toHaveLength(1);
    expect(h.send({ type: "preset-load", request: "after-unload" })).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
