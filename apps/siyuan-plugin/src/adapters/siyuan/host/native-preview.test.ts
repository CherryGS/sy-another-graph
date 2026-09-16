import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeBlockPreview } from "./native-preview";

function harness() {
  vi.stubGlobal("MouseEvent", Event);
  const anchors: HTMLElement[] = [];
  const eventTargets: unknown[] = [];
  const doc = {
    body: { appendChild: (anchor: HTMLElement) => anchors.push(anchor) },
    createElement: () => ({
      dataset: {} as Record<string, string>,
      style: {},
      setAttribute: vi.fn(),
      remove: vi.fn(),
      dispatchEvent() {
        eventTargets.push(this);
      },
    }),
    elementFromPoint: vi.fn(),
  };
  const frame = {
    ownerDocument: doc,
    clientWidth: 1000,
    clientHeight: 800,
    getBoundingClientRect: () => ({ left: 120, top: 60, width: 800, height: 640 }),
    dispatchEvent() {
      eventTargets.push(this);
    },
  };
  doc.elementFromPoint.mockReturnValue(frame);
  const preview = new NativeBlockPreview(frame as unknown as HTMLIFrameElement);
  const enter = (overrides = {}) =>
    preview.handle({
      channel: "sy-another-graph",
      type: "native-preview",
      action: "enter",
      token: 1,
      id: "20260822181032-6spbotb",
      rect: { left: 600, top: 100, width: 280, height: 70 },
      ...overrides,
    });
  const leave = (overrides = {}) =>
    preview.handle({
      channel: "sy-another-graph",
      type: "native-preview",
      action: "leave",
      token: 1,
      x: 650,
      y: 160,
      ...overrides,
    });
  return { anchors, eventTargets, doc, frame, preview, enter, leave };
}

afterEach(() => vi.unstubAllGlobals());

describe("host native block preview", () => {
  it("positions an inert reference at the title's scaled host viewport rectangle", () => {
    const h = harness();
    h.enter();
    const anchor = h.anchors[0];
    expect(anchor.dataset).toMatchObject({ type: "block-ref", id: "20260822181032-6spbotb" });
    expect(anchor.style).toMatchObject({
      left: "600px",
      top: "140px",
      width: "224px",
      height: "56px",
    });
    expect(anchor.style.cssText).toContain("pointer-events:none");
    expect(h.eventTargets).toEqual([anchor]);
    h.preview.clear();
    expect(h.eventTargets.at(-1)).toBe(h.frame);
    expect(anchor.remove).toHaveBeenCalledOnce();
  });

  it("rejects invalid identities, channels, dimensions, and off-frame anchors", () => {
    const h = harness();
    for (const override of [
      { id: "av:unknown" },
      { channel: "other" },
      { token: "1" },
      { rect: { left: 0, top: 0, width: NaN, height: 2 } },
      { rect: { left: -1, top: 10, width: 20, height: 20 } },
      { rect: { left: 990, top: 10, width: 20, height: 20 } },
      { rect: { left: 200, top: 810, width: 20, height: 20 } },
    ])
      h.enter(override);
    expect(h.anchors).toHaveLength(0);
  });

  it("cancels delayed entry but preserves native pointer transfer into a popover", () => {
    const h = harness();
    h.enter();
    h.doc.elementFromPoint.mockReturnValue({ nativePopover: true });
    h.leave();
    expect(h.anchors[0].dataset.type).toBeUndefined();
    expect(h.eventTargets).toEqual([h.anchors[0]]);
    expect(h.doc.elementFromPoint).toHaveBeenCalledWith(640, 188);
    h.preview.clear();
    expect(h.eventTargets.at(-1)).toBe(h.frame);
  });

  it("ignores a retired title's leave and cleanup after a different title enters", () => {
    const h = harness();
    h.enter();
    h.enter({ token: 2, id: "20260822181032-at0rhte" });
    const count = h.eventTargets.length;
    h.leave();
    h.leave({ action: "cancel" });
    expect(h.eventTargets).toHaveLength(count);
    expect(h.anchors[1].dataset.id).toBe("20260822181032-at0rhte");
    expect(h.anchors[0].remove).toHaveBeenCalledOnce();
    h.leave({ token: 2 });
    expect(h.eventTargets.at(-1)).toBe(h.frame);
  });
});
