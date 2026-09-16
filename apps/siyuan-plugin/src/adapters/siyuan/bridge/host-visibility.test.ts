import { describe, expect, it, vi } from "vitest";
import { subscribeHostVisibility } from "./host-visibility";

function host() {
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  const parent = { postMessage: vi.fn() };
  const target = Object.assign(new EventTarget(), {
    document,
    parent,
    location: { origin: "http://localhost:6806" },
  });
  const publish = vi.fn();
  const close = subscribeHostVisibility(target as unknown as Window, publish);
  const message = (active: unknown, origin = target.location.origin, source: unknown = parent) => {
    const event = new MessageEvent("message", {
      origin,
      data: { channel: "sy-another-graph", type: "host-visibility", active },
    });
    Object.defineProperty(event, "source", { value: source });
    target.dispatchEvent(event);
  };
  return { target, document, parent, publish, close, message };
}

describe("host visibility bridge", () => {
  it("handshakes after listening and accepts only the owning parent's boolean visibility", () => {
    const fixture = host();
    expect(fixture.parent.postMessage).toHaveBeenCalledWith(
      { channel: "sy-another-graph", type: "workbench-ready" },
      "http://localhost:6806",
    );
    fixture.publish.mockClear();
    fixture.message(false, "https://untrusted.example");
    fixture.message(false, undefined, {});
    fixture.message("false");
    expect(fixture.publish).not.toHaveBeenCalled();
    fixture.message(false);
    fixture.message(true);
    expect(fixture.publish.mock.calls).toEqual([[false], [true]]);
    fixture.close();
  });

  it("resumes only when both the host tab and browser document are visible", () => {
    const fixture = host();
    fixture.document.visibilityState = "hidden";
    fixture.document.dispatchEvent(new Event("visibilitychange"));
    fixture.message(true);
    expect(fixture.publish).toHaveBeenLastCalledWith(false);
    fixture.document.visibilityState = "visible";
    fixture.document.dispatchEvent(new Event("visibilitychange"));
    expect(fixture.publish).toHaveBeenLastCalledWith(true);
    fixture.message(false);
    fixture.document.dispatchEvent(new Event("visibilitychange"));
    expect(fixture.publish).toHaveBeenLastCalledWith(false);
    fixture.close();
  });

  it("removes both listeners when the workbench application is disposed", () => {
    const fixture = host();
    fixture.close();
    fixture.publish.mockClear();
    fixture.message(false);
    fixture.document.dispatchEvent(new Event("visibilitychange"));
    expect(fixture.publish).not.toHaveBeenCalled();
  });
});
