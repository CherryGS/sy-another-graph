import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PresetClient } from "./client";
import { WORKBENCH_PRESET_CHANNEL, type PresetRequest } from "./host-protocol";
import { createPresetStore } from "./model";

const clients: PresetClient[] = [];

function host(timeout = 1_000) {
  const parent = { postMessage: vi.fn<(message: PresetRequest, origin: string) => void>() };
  const target = Object.assign(new EventTarget(), {
    parent,
    location: { origin: "http://localhost:6806" },
  });
  const addListener = vi.spyOn(target, "addEventListener");
  const removeListener = vi.spyOn(target, "removeEventListener");
  const client = new PresetClient(target as unknown as Window, timeout);
  clients.push(client);
  const message = (data: unknown, origin = target.location.origin, source: unknown = parent) => {
    const event = new MessageEvent("message", { data, origin });
    Object.defineProperty(event, "source", { value: source });
    target.dispatchEvent(event);
  };
  const request = (index = 0) => parent.postMessage.mock.calls[index]![0];
  const response = (requestId: string, payload: Record<string, unknown>) => ({
    channel: WORKBENCH_PRESET_CHANNEL,
    type: "preset-response",
    request: requestId,
    ...payload,
  });
  return { client, parent, target, addListener, removeListener, message, request, response };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const client of clients.splice(0)) client.dispose();
  vi.useRealTimers();
});

describe("preset host client", () => {
  it("correlates concurrent load and save replies received out of order", async () => {
    const h = host();
    const store = createPresetStore();
    const loaded = h.client.load();
    const saved = h.client.save(store);
    expect(h.request()).toEqual({
      channel: WORKBENCH_PRESET_CHANNEL,
      type: "preset-load",
      request: expect.any(String),
    });
    expect(h.request(1)).toEqual({
      channel: WORKBENCH_PRESET_CHANNEL,
      type: "preset-save",
      request: expect.any(String),
      store,
    });
    expect(h.request(1).request).not.toBe(h.request().request);
    expect(h.parent.postMessage.mock.calls.map((call) => call[1])).toEqual([
      h.target.location.origin,
      h.target.location.origin,
    ]);
    h.message(h.response(h.request(1).request, { ok: true, store }));
    await expect(saved).resolves.toEqual(store);
    expect(vi.getTimerCount()).toBe(1);
    h.message(h.response(h.request().request, { ok: true, store: null }));
    await expect(loaded).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores messages outside the owning host and request envelope", async () => {
    const h = host();
    const loaded = h.client.load();
    const settled = vi.fn();
    void loaded.then(settled);
    const valid = h.response(h.request().request, { ok: true, store: null });
    h.message(valid, "https://untrusted.example");
    h.message(valid, undefined, {});
    h.message(valid, undefined, h.target);
    h.message({ ...valid, request: "unknown-request" });
    h.message({ ...valid, request: 1 });
    h.message({ ...valid, channel: "another-plugin" });
    h.message({ ...valid, type: "source-changed" });
    h.message(null);
    h.message("preset-response");
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    h.message(valid);
    await expect(loaded).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    {
      label: "host failure",
      payload: { ok: false, error: "Unable to save presets" },
      error: "Unable to save presets",
    },
    {
      label: "unsupported store",
      payload: { ok: true, store: { version: 2 } },
      error: "text.thePresetFormatIsUnsupportedTheOriginalFile",
    },
    {
      label: "missing store",
      payload: { ok: true },
      error: "text.thePresetFormatIsUnsupportedTheOriginalFile",
    },
    {
      label: "missing status",
      payload: { store: null },
      error: "text.siyuanReturnedAnInvalidPresetResponse",
    },
    {
      label: "non-boolean status",
      payload: { ok: "true", store: null },
      error: "text.siyuanReturnedAnInvalidPresetResponse",
    },
    {
      label: "invalid failure detail",
      payload: { ok: false, error: 42 },
      error: "text.siyuanReturnedAnInvalidPresetResponse",
    },
  ])("rejects $label and clears its timeout", async ({ payload, error }) => {
    const h = host();
    const loaded = h.client.load();
    const rejected = expect(loaded).rejects.toThrow(error);
    h.message(h.response(h.request().request, payload));
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out once, ignores a late reply, and accepts a subsequent request", async () => {
    const h = host();
    const loaded = h.client.load();
    const rejected = expect(loaded).rejects.toThrow("text.siyuanDidNotRespondToThePresetRequest");
    await vi.advanceTimersByTimeAsync(1_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);

    const retried = h.client.load();
    const settled = vi.fn();
    void retried.then(settled);
    h.message(h.response(h.request().request, { ok: true, store: createPresetStore() }));
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    h.message(h.response(h.request(1).request, { ok: true, store: null }));
    await expect(retried).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("disposes the listener and all pending requests, then refuses more work", async () => {
    const h = host();
    const loaded = expect(h.client.load()).rejects.toThrow("text.thePresetConnectionIsClosed");
    const saved = expect(h.client.save(createPresetStore())).rejects.toThrow(
      "text.thePresetConnectionIsClosed",
    );
    expect(vi.getTimerCount()).toBe(2);
    h.client.dispose();
    await Promise.all([loaded, saved]);
    expect(h.addListener).toHaveBeenCalledWith("message", expect.any(Function));
    expect(h.removeListener).toHaveBeenCalledWith("message", h.addListener.mock.calls[0]![1]);
    expect(vi.getTimerCount()).toBe(0);
    h.message(h.response(h.request().request, { ok: true, store: null }));
    await expect(h.client.load()).rejects.toThrow("text.openTheGraphInASiyuanPluginTab");
    await expect(h.client.save(createPresetStore())).rejects.toThrow(
      "text.openTheGraphInASiyuanPluginTab",
    );
    expect(h.parent.postMessage).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects standalone browser requests without sending or scheduling them", async () => {
    const h = host();
    Object.defineProperty(h.target, "parent", { value: h.target });
    await expect(h.client.load()).rejects.toThrow("text.openTheGraphInASiyuanPluginTab");
    await expect(h.client.save(createPresetStore())).rejects.toThrow(
      "text.openTheGraphInASiyuanPluginTab",
    );
    expect(h.parent.postMessage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([new Error("Host transport unavailable"), "Host transport unavailable"])(
    "cleans up synchronous postMessage failures and permits retry (%s)",
    async (failure) => {
      const h = host();
      h.parent.postMessage.mockImplementationOnce(() => {
        throw failure;
      });
      await expect(h.client.load()).rejects.toThrow("Host transport unavailable");
      expect(vi.getTimerCount()).toBe(0);
      const retried = h.client.load();
      const settled = vi.fn();
      void retried.then(settled);
      h.message(h.response(h.request().request, { ok: true, store: createPresetStore() }));
      await Promise.resolve();
      expect(settled).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(1);
      h.message(h.response(h.request(1).request, { ok: true, store: null }));
      await expect(retried).resolves.toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
