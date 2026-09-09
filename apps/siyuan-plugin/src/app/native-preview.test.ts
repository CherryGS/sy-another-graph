import { describe, expect, it, vi } from "vitest";
import { bindNativePreview } from "./native-preview";

const ID = "20260822181032-6spbotb";
function harness(id = ID, embedded = true) {
  const postMessage = vi.fn();
  const target = Object.assign(new EventTarget(), {
    parent: {} as unknown,
    location: { origin: "http://localhost:6806" },
  });
  target.parent = embedded ? { postMessage } : target;
  const element = Object.assign(new EventTarget(), {
    ownerDocument: { defaultView: target },
    getBoundingClientRect: () => ({ left: 200, top: 100, width: 250, height: 70 }),
  });
  const close = bindNativePreview(element as unknown as HTMLElement, id);
  const mouse = (type: string, fields = {}) => element.dispatchEvent(Object.assign(
    new Event(type), { buttons: 0, clientX: 250, clientY: 180, ...fields },
  ));
  return { target, element, postMessage, close, mouse };
}

describe("native preview hover binding", () => {
  it("forwards a native identity and CSS geometry to the current host origin only", () => {
    const h = harness();
    h.mouse("mouseenter");
    expect(h.postMessage).toHaveBeenCalledWith({
      channel: "sy-another-graph", type: "native-preview", token: expect.any(Number),
      action: "enter", id: ID, rect: { left: 200, top: 100, width: 250, height: 70 },
    }, "http://localhost:6806");
    h.mouse("mouseenter");
    expect(h.postMessage).toHaveBeenCalledTimes(1);
    h.mouse("mouseleave");
    expect(h.postMessage.mock.calls.at(-1)![0]).toMatchObject({ action: "leave", x: 250, y: 180 });
    h.close();
    expect(h.postMessage).toHaveBeenCalledTimes(2);
  });

  it.each(["scroll", "resize", "blur"])("cancels pending hover on %s and resumes only on a new entry", (type) => {
    const h = harness();
    h.mouse("mouseenter");
    const token = h.postMessage.mock.calls[0][0].token;
    h.target.dispatchEvent(new Event(type));
    expect(h.postMessage.mock.calls.at(-1)![0]).toMatchObject({ action: "cancel", token });
    h.target.dispatchEvent(new Event(type));
    expect(h.postMessage).toHaveBeenCalledTimes(2);
    h.mouse("mouseleave");
    h.mouse("mouseenter");
    expect(h.postMessage.mock.calls.at(-1)![0].token).toBeGreaterThan(token);
    h.close();
  });

  it("cancels on click and unmount without intercepting the existing click action", () => {
    const h = harness();
    h.mouse("mouseenter");
    expect(h.mouse("mousedown")).toBe(true);
    expect(h.postMessage.mock.calls.at(-1)![0].action).toBe("cancel");
    h.mouse("mouseenter");
    h.close();
    const count = h.postMessage.mock.calls.length;
    h.mouse("mouseenter");
    h.target.dispatchEvent(new Event("scroll"));
    expect(h.postMessage).toHaveBeenCalledTimes(count);
  });

  it("does not reopen on a replacement title appearing under the clicked pointer", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const h = harness();
    h.mouse("mouseenter");
    h.mouse("mousedown");
    h.close();
    const closeReplacement = bindNativePreview(h.element as unknown as HTMLElement, ID);
    h.mouse("mouseenter");
    expect(h.postMessage).toHaveBeenCalledTimes(2);
    clock.mockReturnValue(1_301);
    h.mouse("mouseenter");
    expect(h.postMessage.mock.calls.at(-1)![0].action).toBe("enter");
    closeReplacement();
    clock.mockRestore();
  });

  it("does not preview drags, namespaced entities, or standalone workbenches", () => {
    const h = harness();
    h.mouse("mouseenter", { buttons: 1 });
    expect(h.postMessage).not.toHaveBeenCalled();
    h.close();
    for (const fixture of [harness("av:example"), harness(ID, false)]) {
      fixture.mouse("mouseenter");
      expect(fixture.postMessage).not.toHaveBeenCalled();
      fixture.close();
    }
  });
});
