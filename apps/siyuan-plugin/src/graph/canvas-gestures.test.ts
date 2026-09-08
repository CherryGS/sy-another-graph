import { describe, expect, it, vi } from "vitest";
import { CanvasGestures, type CanvasGestureOptions } from "./canvas-gestures";

function mouse(type: string, x = 0, y = 0, shiftKey = true, detail = 1) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { clientX: x, clientY: y, shiftKey, detail, button: 0 });
  return event;
}

function harness() {
  const host = new EventTarget();
  const targetWindow = new EventTarget();
  const targetDocument = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  const frames = new Map<number, () => void>();
  let serial = 0;
  let now = 0;
  const motion = { move: vi.fn() };
  const options = {
    active: vi.fn(() => true),
    chosenIds: vi.fn(() => ["a", "b"]),
    nodeAt: vi.fn((): string | null => "a"),
    overRelationship: vi.fn(() => false),
    pointerPosition: vi.fn((event: MouseEvent): [number, number] => [
      event.clientX / 2,
      event.clientY / 2,
    ]),
    begin: vi.fn(() => motion),
    onStart: vi.fn(),
    onMove: vi.fn(),
    onEnd: vi.fn(),
    onClearChosen: vi.fn(),
    onError: vi.fn(),
  } satisfies CanvasGestureOptions;
  const gesture = new CanvasGestures(
    host,
    options,
    { window: targetWindow, document: targetDocument },
    {
      frame(callback) {
        frames.set(++serial, callback);
        return serial;
      },
      cancelFrame(id) {
        frames.delete(id);
      },
      now: () => now,
    },
  );
  const draw = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback();
  };
  return {
    host,
    targetWindow,
    targetDocument,
    frames,
    motion,
    options,
    gesture,
    draw,
    advance: () => {
      now += 1000;
    },
  };
}

describe("canvas gestures", () => {
  it("coalesces Shift movement of the explicit set and blocks its following click", () => {
    const h = harness();
    const nativeDown = vi.fn();
    const nativeClick = vi.fn();
    h.host.addEventListener("mousedown", nativeDown);
    h.host.addEventListener("click", nativeClick);
    h.host.dispatchEvent(mouse("mousedown", 10, 20));
    expect(nativeDown).not.toHaveBeenCalled();
    expect(h.options.begin).not.toHaveBeenCalled();
    h.targetWindow.dispatchEvent(mouse("mousemove", 20, 30));
    h.targetWindow.dispatchEvent(mouse("mousemove", 24, 36));
    expect(h.options.begin).toHaveBeenCalledExactlyOnceWith(
      ["a", "b"],
      [5, 10],
      "a",
    );
    expect(h.frames.size).toBe(1);
    h.draw();
    expect(h.motion.move).toHaveBeenCalledExactlyOnceWith([12, 18]);
    h.targetWindow.dispatchEvent(mouse("mouseup", 24, 36));
    expect(h.options.onEnd).toHaveBeenCalledExactlyOnceWith(true);
    h.host.dispatchEvent(mouse("click", 24, 36));
    expect(nativeClick).not.toHaveBeenCalled();
    h.gesture.dispose();
  });

  it("does not turn a Shift click into a drag, and leaves ordinary dragging native", () => {
    const h = harness();
    const nativeClick = vi.fn();
    const nativeDown = vi.fn();
    h.host.addEventListener("click", nativeClick);
    h.host.addEventListener("mousedown", nativeDown);
    h.host.dispatchEvent(mouse("mousedown"));
    h.targetWindow.dispatchEvent(mouse("mouseup"));
    h.host.dispatchEvent(mouse("click"));
    expect(nativeClick).toHaveBeenCalledTimes(1);
    expect(h.options.begin).not.toHaveBeenCalled();
    h.host.dispatchEvent(mouse("mousedown", 0, 0, false));
    h.targetWindow.dispatchEvent(mouse("mousemove", 20, 30, false));
    h.targetWindow.dispatchEvent(mouse("mouseup", 20, 30, false));
    expect(nativeDown).toHaveBeenCalledTimes(1);
    expect(h.options.begin).not.toHaveBeenCalled();
    h.gesture.dispose();
  });

  it("keeps the camera plane fixed during a Shift drag and restores wheel navigation on release", () => {
    const h = harness();
    const zoom = vi.fn();
    h.targetWindow.addEventListener("wheel", zoom);
    h.host.dispatchEvent(mouse("mousedown"));
    h.targetWindow.dispatchEvent(new Event("wheel", { cancelable: true }));
    expect(zoom).not.toHaveBeenCalled();
    h.targetWindow.dispatchEvent(mouse("mouseup"));
    h.targetWindow.dispatchEvent(new Event("wheel", { cancelable: true }));
    expect(zoom).toHaveBeenCalledTimes(1);
    h.gesture.dispose();
  });

  it.each(["neighbor", null])("reserves Shift dragging from %s without native pan or selection", (nodeId) => {
    const h = harness();
    h.options.nodeAt.mockReturnValue(nodeId);
    const nativeDown = vi.fn();
    const nativeMove = vi.fn();
    const nativeUp = vi.fn();
    const clicked = vi.fn();
    h.host.addEventListener("mousedown", nativeDown);
    h.targetWindow.addEventListener("mousemove", nativeMove);
    h.targetWindow.addEventListener("mouseup", nativeUp);
    h.host.addEventListener("click", clicked);
    h.host.dispatchEvent(mouse("mousedown"));
    // Releasing Shift halfway through a drag must not hand it over to the camera.
    h.targetWindow.dispatchEvent(mouse("mousemove", 12, 0, false));
    h.targetWindow.dispatchEvent(mouse("mouseup", 12, 0, false));
    h.host.dispatchEvent(mouse("click", 12, 0));
    expect(nativeDown).not.toHaveBeenCalled();
    expect(nativeMove).not.toHaveBeenCalled();
    expect(nativeUp).not.toHaveBeenCalled();
    expect(h.options.begin).not.toHaveBeenCalled();
    expect(clicked).not.toHaveBeenCalled();
    h.gesture.dispose();
  });

  it("preserves a nonmember Shift click below the drag threshold", () => {
    const h = harness();
    h.options.nodeAt.mockReturnValue("neighbor");
    const clicked = vi.fn();
    h.host.addEventListener("click", clicked);
    h.host.dispatchEvent(mouse("mousedown"));
    h.targetWindow.dispatchEvent(mouse("mousemove", 1, 1));
    h.targetWindow.dispatchEvent(mouse("mouseup", 1, 1));
    h.host.dispatchEvent(mouse("click", 1, 1));
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(h.options.begin).not.toHaveBeenCalled();
    h.gesture.dispose();
  });

  it("leaves ordinary blank-canvas panning native without querying point positions", () => {
    const h = harness();
    const nativeDown = vi.fn();
    const nativeMove = vi.fn();
    const nativeUp = vi.fn();
    h.host.addEventListener("mousedown", nativeDown);
    h.targetWindow.addEventListener("mousemove", nativeMove);
    h.targetWindow.addEventListener("mouseup", nativeUp);
    h.host.dispatchEvent(mouse("mousedown", 0, 0, false));
    h.targetWindow.dispatchEvent(mouse("mousemove", 12, 0, false));
    h.targetWindow.dispatchEvent(mouse("mouseup", 12, 0, false));
    expect(nativeDown).toHaveBeenCalledTimes(1);
    expect(nativeMove).toHaveBeenCalledTimes(1);
    expect(nativeUp).toHaveBeenCalledTimes(1);
    expect(h.options.nodeAt).not.toHaveBeenCalled();
    expect(h.options.begin).not.toHaveBeenCalled();
    h.gesture.dispose();
  });

  it("clears only on a genuine Shift-double-click of blank canvas, before native zoom", () => {
    const h = harness();
    const zoom = vi.fn();
    h.host.addEventListener("dblclick", zoom);
    h.options.nodeAt.mockReturnValue(null);
    h.host.dispatchEvent(mouse("dblclick", 0, 0, true, 2));
    expect(h.options.onClearChosen).toHaveBeenCalledTimes(1);
    expect(zoom).not.toHaveBeenCalled();
    h.options.overRelationship.mockReturnValue(true);
    h.host.dispatchEvent(mouse("dblclick", 0, 0, true, 2));
    expect(h.options.onClearChosen).toHaveBeenCalledTimes(1);
    expect(zoom).not.toHaveBeenCalled();
    h.options.overRelationship.mockReturnValue(false);
    h.options.nodeAt.mockReturnValue("a");
    h.host.dispatchEvent(mouse("dblclick", 0, 0, true, 2));
    expect(h.options.onClearChosen).toHaveBeenCalledTimes(1);
    expect(zoom).not.toHaveBeenCalled();
    h.options.nodeAt.mockReturnValue(null);
    h.host.dispatchEvent(mouse("mousedown"));
    h.targetWindow.dispatchEvent(mouse("mousemove", 20, 0));
    h.targetWindow.dispatchEvent(mouse("mouseup", 20, 0));
    h.host.dispatchEvent(mouse("dblclick", 20, 0, true, 2));
    expect(h.options.onClearChosen).toHaveBeenCalledTimes(1);
    h.gesture.dispose();
  });

  it("cancels pending movement on visibility changes and ignores stale frames after disposal", () => {
    const h = harness();
    h.host.dispatchEvent(mouse("mousedown"));
    h.targetWindow.dispatchEvent(mouse("mousemove", 10, 10));
    const stale = h.frames.values().next().value!;
    h.targetDocument.visibilityState = "hidden";
    h.targetDocument.dispatchEvent(new Event("visibilitychange"));
    expect(h.frames.size).toBe(0);
    expect(h.options.onEnd).toHaveBeenCalledExactlyOnceWith(false);
    h.gesture.dispose();
    stale();
    expect(h.motion.move).not.toHaveBeenCalled();
  });

  it("reports unavailable movement support without leaving an active drag", () => {
    const h = harness();
    const failure = new Error("unavailable");
    h.options.begin.mockImplementation(() => {
      throw failure;
    });
    h.host.dispatchEvent(mouse("mousedown"));
    h.targetWindow.dispatchEvent(mouse("mousemove", 10, 0));
    expect(h.options.onError).toHaveBeenCalledExactlyOnceWith(failure);
    h.targetWindow.dispatchEvent(mouse("mousemove", 20, 0));
    expect(h.options.begin).toHaveBeenCalledTimes(1);
    expect(h.frames.size).toBe(0);
    h.gesture.dispose();
  });
});
