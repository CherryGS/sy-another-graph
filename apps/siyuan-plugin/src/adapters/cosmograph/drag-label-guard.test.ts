import { expect, it } from "vitest";
import { DragLabelGuard } from "./drag-label-guard";

class VisibilityTarget extends EventTarget {
  visibilityState = "visible";
}

function fixture() {
  const attributes = new Map<string, string>();
  const host = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => {
      attributes.delete(name);
    },
  };
  const windowEvents = new EventTarget();
  const documentEvents = new VisibilityTarget();
  const guard = new DragLabelGuard(host, {
    window: windowEvents,
    document: documentEvents,
  });
  return { attributes, host, windowEvents, documentEvents, guard };
}

it("changes hit-testing state synchronously without consuming click events", () => {
  const { guard, attributes, windowEvents } = fixture();
  expect(attributes.has("data-point-dragging")).toBe(false);
  guard.begin();
  expect(attributes.get("data-point-dragging")).toBe("true");
  guard.end();
  expect(attributes.has("data-point-dragging")).toBe(false);
  let clicks = 0;
  windowEvents.addEventListener("click", () => {
    clicks++;
  });
  const click = new Event("click", { cancelable: true });
  windowEvents.dispatchEvent(click);
  expect(clicks).toBe(1);
  expect(click.defaultPrevented).toBe(false);
  guard.dispose();
});

it.each(["blur", "pointercancel"])("clears an interrupted gesture on %s", (type) => {
  const { guard, attributes, windowEvents } = fixture();
  guard.begin();
  windowEvents.dispatchEvent(new Event(type));
  expect(attributes.has("data-point-dragging")).toBe(false);
  guard.begin();
  expect(attributes.get("data-point-dragging")).toBe("true");
  guard.dispose();
});

it("ignores captured descendant blur after a mousedown starts dragging", () => {
  const { guard, attributes, windowEvents } = fixture();
  guard.begin();
  // Node EventTarget has no DOM ancestor path; preserve the descendant target
  // while delivering the event to the window's actual capture listener.
  const descendantBlur = new Event("blur");
  Object.defineProperty(descendantBlur, "target", { value: new EventTarget() });
  windowEvents.dispatchEvent(descendantBlur);
  expect(attributes.get("data-point-dragging")).toBe("true");
  windowEvents.dispatchEvent(new Event("blur"));
  expect(attributes.has("data-point-dragging")).toBe(false);
  guard.dispose();
});

it("clears a drag when its document becomes hidden", () => {
  const { guard, attributes, documentEvents } = fixture();
  guard.begin();
  documentEvents.dispatchEvent(new Event("visibilitychange"));
  expect(attributes.get("data-point-dragging")).toBe("true");
  documentEvents.visibilityState = "hidden";
  documentEvents.dispatchEvent(new Event("visibilitychange"));
  expect(attributes.has("data-point-dragging")).toBe(false);
  guard.dispose();
});

it("releases listeners and cannot restart after disposal", () => {
  const { guard, attributes, host, windowEvents, documentEvents } = fixture();
  guard.begin();
  guard.dispose();
  guard.dispose();
  guard.begin();
  expect(attributes.has("data-point-dragging")).toBe(false);

  // A replacement owner must not be affected by the disposed guard's listeners.
  host.setAttribute("data-point-dragging", "replacement");
  guard.end();
  windowEvents.dispatchEvent(new Event("blur"));
  windowEvents.dispatchEvent(new Event("pointercancel"));
  documentEvents.visibilityState = "hidden";
  documentEvents.dispatchEvent(new Event("visibilitychange"));
  expect(attributes.get("data-point-dragging")).toBe("replacement");
});
