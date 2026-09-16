import { describe, expect, it, vi } from "vitest";
import { SourceRefresh, subscribeSourceRefresh, type RefreshScheduler } from "./source-refresh";

class Clock implements RefreshScheduler {
  private now = 0;
  private nextId = 0;
  private readonly timers = new Map<number, { due: number; callback: () => void }>();
  readonly callbacks: (() => void)[] = [];

  delay(callback: () => void, milliseconds: number) {
    const id = ++this.nextId;
    this.timers.set(id, { due: this.now + milliseconds, callback });
    this.callbacks.push(callback);
    return id;
  }

  cancel(id: number) {
    this.timers.delete(id);
  }

  get pending() {
    return this.timers.size;
  }

  advance(milliseconds: number) {
    const end = this.now + milliseconds;
    while (true) {
      const next = [...this.timers].sort((left, right) => left[1].due - right[1].due)[0];
      if (!next || next[1].due > end) break;
      this.timers.delete(next[0]);
      this.now = next[1].due;
      next[1].callback();
    }
    this.now = end;
  }
}

function host(initialVisibility = "visible") {
  const clock = new Clock();
  const document = Object.assign(new EventTarget(), {
    visibilityState: initialVisibility,
  });
  const parent = { postMessage: vi.fn() };
  const target = Object.assign(new EventTarget(), {
    document,
    parent,
    location: { origin: "http://localhost:6806" },
  });
  const versions: number[] = [];
  let refresh: SourceRefresh;
  // The actual read begins synchronously, while completion remains under each test's control.
  const reload = vi.fn(() => {
    versions.push(refresh.beginLoad());
  });
  refresh = new SourceRefresh(reload, clock);
  const unsubscribe = subscribeSourceRefresh(target as unknown as Window, refresh);
  const message = (data: unknown, origin = target.location.origin, source: unknown = parent) => {
    const event = new MessageEvent("message", { origin, data });
    Object.defineProperty(event, "source", { value: source });
    target.dispatchEvent(event);
  };
  const change = (version: unknown) =>
    message({
      channel: "sy-another-graph",
      type: "source-changed",
      version,
    });
  const visible = (active: unknown) =>
    message({
      channel: "sy-another-graph",
      type: "host-visibility",
      active,
    });
  const browserVisible = (active: boolean) => {
    document.visibilityState = active ? "visible" : "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
  };
  const close = () => {
    unsubscribe();
    refresh.dispose();
  };
  return {
    clock,
    document,
    parent,
    target,
    refresh,
    reload,
    versions,
    message,
    change,
    visible,
    browserVisible,
    unsubscribe,
    close,
  };
}

describe("source revision refresh", () => {
  it("does not reload for unchanged host or browser visibility", () => {
    const h = host();
    h.visible(false);
    h.visible(true);
    h.browserVisible(false);
    h.browserVisible(true);
    h.clock.advance(1000);
    expect(h.reload).not.toHaveBeenCalled();
    h.change(1);
    h.clock.advance(350);
    expect(h.versions).toEqual([1]);
    h.refresh.completeLoad(1, true);
    h.visible(false);
    h.visible(true);
    h.browserVisible(false);
    h.browserVisible(true);
    h.clock.advance(1000);
    expect(h.versions).toEqual([1]);
    h.close();
  });

  it("retains dirty revisions while hidden and reloads only when both visibility sources allow it", () => {
    const h = host("hidden");
    h.visible(false);
    h.change(1);
    h.change(3);
    h.clock.advance(1000);
    expect(h.clock.pending).toBe(0);
    expect(h.reload).not.toHaveBeenCalled();
    h.visible(true);
    h.clock.advance(1000);
    expect(h.reload).not.toHaveBeenCalled();
    h.browserVisible(true);
    h.clock.advance(349);
    expect(h.reload).not.toHaveBeenCalled();
    h.clock.advance(1);
    expect(h.versions).toEqual([3]);
    h.close();
  });

  it("cancels a pending read when hidden without losing its dirty revision", () => {
    const h = host();
    h.change(1);
    h.clock.advance(200);
    h.visible(false);
    h.clock.advance(1000);
    expect(h.reload).not.toHaveBeenCalled();
    h.visible(true);
    h.clock.advance(349);
    expect(h.reload).not.toHaveBeenCalled();
    h.clock.advance(1);
    expect(h.versions).toEqual([1]);
    h.close();
  });

  it("restarts the 350 ms debounce for a newer revision", () => {
    const h = host();
    h.change(1);
    h.clock.advance(200);
    h.change(2);
    expect(h.clock.pending).toBe(1);
    h.clock.advance(150);
    expect(h.reload).not.toHaveBeenCalled();
    h.clock.advance(199);
    expect(h.reload).not.toHaveBeenCalled();
    h.clock.advance(1);
    expect(h.versions).toEqual([2]);
    h.close();
  });

  it("ignores duplicate and older revisions without postponing the current debounce", () => {
    const h = host();
    h.change(3);
    h.clock.advance(200);
    h.change(3);
    h.change(2);
    h.change(1);
    h.clock.advance(149);
    expect(h.reload).not.toHaveBeenCalled();
    h.clock.advance(1);
    expect(h.versions).toEqual([3]);
    h.refresh.completeLoad(3, true);
    h.change(3);
    h.change(2);
    h.clock.advance(1000);
    expect(h.versions).toEqual([3]);
    h.close();
  });

  it("follows a successful read with another read for a revision received while loading", () => {
    const h = host();
    h.change(1);
    h.clock.advance(350);
    h.change(2);
    h.change(4);
    h.clock.advance(1000);
    expect(h.versions).toEqual([1]);
    h.refresh.completeLoad(1, true);
    h.clock.advance(349);
    expect(h.versions).toEqual([1]);
    h.clock.advance(1);
    expect(h.versions).toEqual([1, 4]);
    h.refresh.completeLoad(4, true);
    h.clock.advance(1000);
    expect(h.versions).toEqual([1, 4]);
    h.close();
  });

  it("does not loop a failed revision and permits a successful manual retry", () => {
    const h = host();
    h.change(1);
    h.clock.advance(350);
    h.refresh.completeLoad(1, false);
    h.visible(false);
    h.visible(true);
    h.change(1);
    h.clock.advance(10_000);
    expect(h.versions).toEqual([1]);
    expect(h.clock.pending).toBe(0);
    // Manual reload uses the same read entry point without waiting for a new host event.
    h.reload();
    expect(h.versions).toEqual([1, 1]);
    h.refresh.completeLoad(1, true);
    h.clock.advance(1000);
    expect(h.versions).toEqual([1, 1]);
    h.close();
  });

  it("allows a new revision to be attempted after a failed read", () => {
    const h = host();
    h.change(1);
    h.clock.advance(350);
    h.refresh.completeLoad(1, false);
    h.change(2);
    h.clock.advance(349);
    expect(h.versions).toEqual([1]);
    h.clock.advance(1);
    expect(h.versions).toEqual([1, 2]);
    h.close();
  });

  it("does not mark an unread newer revision as failed when the in-flight older read fails", () => {
    const h = host();
    h.change(1);
    h.clock.advance(350);
    h.change(2);
    h.refresh.completeLoad(1, false);
    h.clock.advance(350);
    expect(h.versions).toEqual([1, 2]);
    h.refresh.completeLoad(2, false);
    h.clock.advance(10_000);
    expect(h.versions).toEqual([1, 2]);
    h.close();
  });

  it("rejects untrusted message envelopes and invalid revision values", () => {
    const h = host();
    const valid = {
      channel: "sy-another-graph",
      type: "source-changed",
      version: 1,
    };
    h.message(valid, "https://untrusted.example");
    h.message(valid, undefined, {});
    h.message({ ...valid, channel: "another-plugin" });
    h.message({ ...valid, type: "another-event" });
    h.message(null);
    h.message("source-changed");
    for (const version of [
      undefined,
      null,
      "1",
      true,
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      h.change(version);
    h.clock.advance(1000);
    expect(h.reload).not.toHaveBeenCalled();
    expect(h.clock.pending).toBe(0);
    h.change(1);
    h.clock.advance(350);
    expect(h.versions).toEqual([1]);
    h.close();
  });

  it("accepts only the owning parent's boolean visibility and refuses messages in a standalone window", () => {
    const h = host();
    h.visible(false);
    h.change(1);
    const visible = {
      channel: "sy-another-graph",
      type: "host-visibility",
      active: true,
    };
    h.message(visible, "https://untrusted.example");
    h.message(visible, undefined, {});
    h.message({ ...visible, channel: "another-plugin" });
    h.visible("true");
    h.clock.advance(1000);
    expect(h.reload).not.toHaveBeenCalled();
    h.visible(true);
    h.clock.advance(350);
    expect(h.versions).toEqual([1]);
    h.refresh.completeLoad(1, true);
    Object.defineProperty(h.target, "parent", { value: h.target });
    h.message(
      { channel: "sy-another-graph", type: "source-changed", version: 2 },
      undefined,
      h.target,
    );
    h.clock.advance(1000);
    expect(h.versions).toEqual([1]);
    h.close();
  });

  it("removes both subscriptions and ignores late events after cleanup", () => {
    const h = host();
    const changed = vi.spyOn(h.refresh, "sourceChanged");
    const active = vi.spyOn(h.refresh, "setActive");
    h.unsubscribe();
    h.change(1);
    h.visible(false);
    h.browserVisible(false);
    expect(changed).not.toHaveBeenCalled();
    expect(active).not.toHaveBeenCalled();
    h.clock.advance(1000);
    expect(h.reload).not.toHaveBeenCalled();
    h.close();
  });

  it("cancels scheduled work on disposal and guards a callback already retained by the clock", () => {
    const h = host();
    h.change(1);
    const lateCallback = h.clock.callbacks[0];
    h.refresh.dispose();
    expect(h.clock.pending).toBe(0);
    lateCallback();
    h.change(2);
    h.visible(true);
    h.browserVisible(true);
    h.refresh.completeLoad(1, true);
    h.clock.advance(1000);
    expect(h.reload).not.toHaveBeenCalled();
    h.close();
  });

  it("ignores a late read completion after disposal even when a newer revision was waiting", () => {
    const h = host();
    h.change(1);
    h.clock.advance(350);
    h.change(2);
    h.refresh.dispose();
    h.refresh.completeLoad(1, true);
    h.change(3);
    h.clock.advance(1000);
    expect(h.versions).toEqual([1]);
    expect(h.clock.pending).toBe(0);
    h.close();
  });
});
