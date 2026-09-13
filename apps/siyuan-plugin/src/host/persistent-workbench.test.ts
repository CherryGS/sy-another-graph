import { afterEach, describe, expect, it, vi } from "vitest";
import { PersistentWorkbench, WORKBENCH_CHANNEL } from "./persistent-workbench";
import { NativeBlockPreview } from "./native-preview";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Minimal DOM adapter with observable connection transitions, not an iframe mock
 * that survives arbitrary reparenting. Moving a connected subtree records a
 * disconnect/reconnect so lifecycle regressions fail these tests. */
class ElementStub extends EventTarget {
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: ElementStub[] = [];
  readonly ownerDocument: DocumentStub;
  readonly tagName: string;
  readonly contentWindow = {
    postMessage: vi.fn(),
    retainedSelection: "document-90001",
  };
  parentElement: ElementStub | null = null;
  visible = true;
  visibility = "visible";
  inert = false;
  title = "";
  tabIndex = 0;
  box: Box = { left: 20, top: 70, width: 1000, height: 700 };
  connections = 0;
  disconnections = 0;
  sourceAssignments = 0;
  private source = "";

  constructor(tag: string, document: DocumentStub) {
    super();
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
  }

  set src(value: string) {
    this.sourceAssignments++;
    this.source = value;
  }
  get src(): string {
    return this.source;
  }
  get isConnected(): boolean {
    return (
      this === this.ownerDocument.body ||
      (this.parentElement?.isConnected ?? false)
    );
  }
  appendChild(child: ElementStub): ElementStub {
    child.remove();
    this.children.push(child);
    child.parentElement = this;
    if (child.isConnected) child.connected(true);
    return child;
  }
  remove(): void {
    if (!this.parentElement) return;
    if (this.isConnected) this.connected(false);
    this.parentElement.children.splice(
      this.parentElement.children.indexOf(this),
      1,
    );
    this.parentElement = null;
  }
  private connected(connected: boolean): void {
    if (connected) this.connections++;
    else this.disconnections++;
    for (const child of this.children) child.connected(connected);
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getClientRects(): DOMRect[] {
    if (!this.isConnected || !this.visible) return [];
    for (let node = this.parentElement; node; node = node.parentElement) {
      if (!node.visible) return [];
    }
    return [this.getBoundingClientRect()];
  }
  getBoundingClientRect(): DOMRect {
    const box = this.box;
    return {
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
    } as DOMRect;
  }
  blur(): void {
    if (this.ownerDocument.activeElement === this)
      this.ownerDocument.activeElement = null;
  }
}

class DocumentStub extends EventTarget {
  readonly body = new ElementStub("body", this);
  readonly created: ElementStub[] = [];
  visibilityState = "visible";
  activeElement: ElementStub | null = null;
  createElement(tag: string): ElementStub {
    const element = new ElementStub(tag, this);
    this.created.push(element);
    return element;
  }
}

class ObserverStub {
  readonly observed = new Set<ElementStub>();
  readonly callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
  }
  observe(element: ElementStub): void {
    this.observed.add(element);
  }
  disconnect(): void {
    this.observed.clear();
  }
  trigger(): void {
    this.callback();
  }
}

function harness() {
  const document = new DocumentStub();
  const frames = new Map<number, () => void>();
  const observers: ObserverStub[] = [];
  let sequence = 0;
  const window = Object.assign(new EventTarget(), {
    location: { origin: "http://127.0.0.1:6806" },
    innerWidth: 1440,
    innerHeight: 900,
    requestAnimationFrame(callback: () => void) {
      const id = ++sequence;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id: number) {
      frames.delete(id);
    },
    getComputedStyle(element: ElementStub) {
      return { visibility: element.visibility };
    },
  });
  const Observer = class extends ObserverStub {
    constructor(callback: () => void) {
      super(callback);
      observers.push(this);
    }
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("ResizeObserver", Observer);
  vi.stubGlobal("MutationObserver", Observer);
  const session = new PersistentWorkbench("sy-another-graph");
  const placeholder = () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    return element;
  };
  const attach = (element: ElementStub) =>
    session.attach(element as unknown as HTMLElement);
  const detach = (element: ElementStub) =>
    session.detach(element as unknown as HTMLElement);
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback();
  };
  const iframe = () =>
    document.created.find((element) => element.tagName === "IFRAME")!;
  return {
    session,
    document,
    window,
    observers,
    frames,
    placeholder,
    attach,
    detach,
    flush,
    iframe,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("plugin-lifetime workbench browsing context", () => {
  it("replays only the latest search/scope request until its matching acknowledgement", () => {
    const h = harness();
    const first = { requestId: "first", label: "First", query: "first", ids: ["20260913000000-0000001"] };
    const second = { ...first, requestId: "second" };
    h.session.requestSearch(first);
    h.session.requestSearch(second);
    h.attach(h.placeholder());
    h.session.announceVisibility();
    expect(h.iframe().contentWindow.postMessage).toHaveBeenCalledWith({ channel: WORKBENCH_CHANNEL, type: "search-graph", snapshot: second }, h.window.location.origin);
    h.session.acknowledgeSearch("first");
    h.iframe().contentWindow.postMessage.mockClear();
    h.session.announceVisibility();
    expect(h.iframe().contentWindow.postMessage.mock.calls.some(([message]) => message.type === "search-graph")).toBe(true);
    h.session.requestScope(first.ids[0]);
    h.iframe().contentWindow.postMessage.mockClear();
    h.session.announceVisibility();
    expect(h.iframe().contentWindow.postMessage.mock.calls.some(([message]) => message.type === "search-graph")).toBe(false);
    h.session.requestSearch(first);
    h.session.acknowledgeSearch("first");
    h.iframe().contentWindow.postMessage.mockClear();
    h.session.announceVisibility();
    expect(h.iframe().contentWindow.postMessage.mock.calls.some(([message]) => ["search-graph", "scope-graph"].includes(message.type))).toBe(false);
    h.session.dispose();
  });
  it("admits preview messages only from its visible owned frame and clears them on layout changes", () => {
    const handle = vi.spyOn(NativeBlockPreview.prototype, "handle").mockImplementation(() => {});
    const clear = vi.spyOn(NativeBlockPreview.prototype, "clear").mockImplementation(() => {});
    const h = harness();
    const anchor = h.placeholder();
    h.attach(anchor);
    const event = { origin: h.window.location.origin, source: h.iframe().contentWindow, data: {} } as unknown as MessageEvent;
    clear.mockClear();
    h.session.previewBlock({ ...event, source: null });
    h.session.previewBlock({ ...event, origin: "https://untrusted.example" });
    expect(handle).not.toHaveBeenCalled();
    h.session.previewBlock(event);
    expect(handle).toHaveBeenCalledOnce();
    anchor.box.left += 20;
    h.session.refresh();
    h.flush();
    expect(clear).toHaveBeenCalledOnce();
    h.detach(anchor);
    h.session.previewBlock(event);
    expect(handle).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledTimes(2);
    h.session.dispose();
    expect(clear).toHaveBeenCalledTimes(3);
    handle.mockRestore();
    clear.mockRestore();
  });
  it("retains source versions before iframe setup and replays the latest version after readiness", () => {
    const host = harness();
    host.session.markSourceChanged();
    host.session.markSourceChanged();
    expect(host.document.created).toHaveLength(0);
    host.attach(host.placeholder());
    const frame = host.iframe();
    frame.dispatchEvent(new Event("load"));
    const latest = {
      channel: WORKBENCH_CHANNEL,
      type: "source-changed",
      version: 2,
    };
    expect(frame.contentWindow.postMessage).toHaveBeenLastCalledWith(
      latest,
      host.window.location.origin,
    );
    frame.contentWindow.postMessage.mockClear();
    host.session.announceVisibility();
    expect(frame.contentWindow.postMessage).toHaveBeenLastCalledWith(
      latest,
      host.window.location.origin,
    );
    host.session.markSourceChanged();
    expect(frame.contentWindow.postMessage).toHaveBeenLastCalledWith(
      { ...latest, version: 3 },
      host.window.location.origin,
    );
    host.session.dispose();
  });

  it("increments only for source mutations and retains hidden changes through ordinary visibility switches", () => {
    const host = harness();
    const tab = host.placeholder();
    host.attach(tab);
    const frame = host.iframe();
    host.session.announceVisibility();
    expect(
      frame.contentWindow.postMessage.mock.calls.some(
        ([data]) => data.type === "source-changed",
      ),
    ).toBe(false);
    tab.visible = false;
    host.session.refresh();
    host.flush();
    host.session.markSourceChanged();
    expect(frame.contentWindow.postMessage).toHaveBeenLastCalledWith(
      { channel: WORKBENCH_CHANNEL, type: "source-changed", version: 1 },
      host.window.location.origin,
    );
    tab.visible = true;
    host.session.refresh();
    host.flush();
    host.session.announceVisibility();
    const sourceMessages = frame.contentWindow.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === "source-changed");
    expect(sourceMessages).toEqual([
      { channel: WORKBENCH_CHANNEL, type: "source-changed", version: 1 },
      { channel: WORKBENCH_CHANNEL, type: "source-changed", version: 1 },
    ]);
    expect(frame.sourceAssignments).toBe(1);
    expect(frame.disconnections).toBe(0);
    host.session.dispose();
    frame.contentWindow.postMessage.mockClear();
    host.session.markSourceChanged();
    host.session.announceVisibility();
    expect(frame.contentWindow.postMessage).not.toHaveBeenCalled();
  });

  it("retains a requested scope before the iframe exists and resends it on the ready handshake", () => {
    const host = harness();
    const id = "20260909010000-doc0001";
    host.session.requestScope(id);
    expect(host.document.created).toHaveLength(0);
    host.attach(host.placeholder());
    const frame = host.iframe();
    frame.dispatchEvent(new Event("load"));
    const message = { channel: WORKBENCH_CHANNEL, type: "scope-graph", id };
    expect(frame.contentWindow.postMessage).toHaveBeenLastCalledWith(
      message,
      host.window.location.origin,
    );
    frame.contentWindow.postMessage.mockClear();
    // The application may install its message listener after the DOM load event.
    host.session.announceVisibility();
    expect(frame.contentWindow.postMessage).toHaveBeenLastCalledWith(
      message,
      host.window.location.origin,
    );
    host.session.acknowledgeScope(id);
    frame.contentWindow.postMessage.mockClear();
    host.session.announceVisibility();
    expect(
      frame.contentWindow.postMessage.mock.calls.map(([data]) => data.type),
    ).toEqual(["host-visibility"]);
    host.session.dispose();
  });

  it("keeps only the latest pending scope and ignores acknowledgements of older requests", () => {
    const host = harness();
    const first = "20260909010000-doc0001";
    const latest = "20260909010001-block01";
    host.session.requestScope(first);
    host.session.requestScope(latest);
    host.session.acknowledgeScope(first);
    host.attach(host.placeholder());
    host.session.announceVisibility();
    const frame = host.iframe();
    expect(frame.contentWindow.postMessage).toHaveBeenLastCalledWith(
      { channel: WORKBENCH_CHANNEL, type: "scope-graph", id: latest },
      host.window.location.origin,
    );
    expect(
      frame.contentWindow.postMessage.mock.calls.some(
        ([data]) => data.id === first,
      ),
    ).toBe(false);
    host.session.requestScope("av:20260909010002-abc0001");
    host.session.announceVisibility();
    expect(frame.contentWindow.postMessage).toHaveBeenLastCalledWith(
      { channel: WORKBENCH_CHANNEL, type: "scope-graph", id: latest },
      host.window.location.origin,
    );
    host.session.dispose();
  });

  it("applies a new scope through the same browsing context after a tab was closed", () => {
    const host = harness();
    const first = host.placeholder();
    host.attach(first);
    const frame = host.iframe();
    host.detach(first);
    first.remove();
    const id = "20260909010001-block01";
    host.session.requestScope(id);
    expect(frame.contentWindow.postMessage).toHaveBeenLastCalledWith(
      { channel: WORKBENCH_CHANNEL, type: "scope-graph", id },
      host.window.location.origin,
    );
    host.attach(host.placeholder());
    expect(host.iframe()).toBe(frame);
    expect(frame.sourceAssignments).toBe(1);
    expect(frame.disconnections).toBe(0);
    host.session.dispose();
    frame.contentWindow.postMessage.mockClear();
    host.session.requestScope(id);
    host.session.announceVisibility();
    expect(frame.contentWindow.postMessage).not.toHaveBeenCalled();
  });

  it("creates no iframe until the first host tab opens", () => {
    const host = harness();
    expect(host.document.created).toHaveLength(0);
    host.session.dispose();
    expect(host.document.body.children).toHaveLength(0);
  });

  it("keeps the iframe connected, its state and viewport intact while host tabs hide and show", () => {
    const host = harness();
    const tab = host.placeholder();
    host.attach(tab);
    const iframe = host.iframe();
    const container = iframe.parentElement!;
    iframe.dispatchEvent(new Event("load"));
    expect(iframe.dataset.atlasLoadCount).toBe("1");
    expect(container.style.width).toBe("1000px");
    expect(container.style.height).toBe("700px");

    tab.visible = false;
    host.observers[1].trigger();
    host.flush();
    expect(container.style.visibility).toBe("hidden");
    expect(container.inert).toBe(true);
    expect(iframe.dataset.atlasActive).toBe("false");
    expect(container.style.width).toBe("1000px");
    expect(container.style.height).toBe("700px");
    expect(iframe.isConnected).toBe(true);
    expect(iframe.disconnections).toBe(0);

    tab.visible = true;
    host.observers[0].trigger();
    host.flush();
    expect(container.style.visibility).toBe("visible");
    expect(container.inert).toBe(false);
    expect(iframe.contentWindow.retainedSelection).toBe("document-90001");
    expect(iframe.sourceAssignments).toBe(1);
    expect(iframe.connections).toBe(1);
    expect(iframe.dataset.atlasLoadCount).toBe("1");
    const visibility = iframe.contentWindow.postMessage.mock.calls.map(
      ([message]) => message.active,
    );
    expect(visibility.slice(-2)).toEqual([false, true]);
    host.session.dispose();
  });

  it("retains the same session through tab destruction and reopening into a different panel", () => {
    const host = harness();
    const first = host.placeholder();
    host.attach(first);
    const iframe = host.iframe();
    const container = iframe.parentElement;
    const source = iframe.src;
    const sessionId = iframe.dataset.atlasSession;
    host.detach(first);
    first.remove();
    host.flush();
    expect(iframe.isConnected).toBe(true);
    expect(iframe.dataset.atlasActive).toBe("false");
    const reopened = host.placeholder();
    reopened.box = { left: 400, top: 90, width: 700, height: 500 };
    host.attach(reopened);
    host.flush();
    expect(
      host.document.created.filter((element) => element.tagName === "IFRAME"),
    ).toHaveLength(1);
    expect(host.iframe()).toBe(iframe);
    expect(iframe.parentElement).toBe(container);
    expect(iframe.src).toBe(source);
    expect(iframe.dataset.atlasSession).toBe(sessionId);
    expect(iframe.dataset.atlasActive).toBe("true");
    expect(container?.style.left).toBe("400px");
    expect(container?.style.width).toBe("700px");
    expect(iframe.disconnections).toBe(0);
    expect(iframe.connections).toBe(1);
    host.session.dispose();
  });

  it("tracks panel resize and document visibility without reassigning iframe src", () => {
    const host = harness();
    const tab = host.placeholder();
    host.attach(tab);
    tab.box = { left: 200, top: 80, width: 600, height: 400 };
    host.observers[0].trigger();
    host.flush();
    const frame = host.iframe();
    expect(frame.parentElement?.style.width).toBe("600px");
    host.document.visibilityState = "hidden";
    host.document.dispatchEvent(new Event("visibilitychange"));
    host.flush();
    expect(frame.dataset.atlasActive).toBe("false");
    expect(frame.parentElement?.style.height).toBe("400px");
    host.document.visibilityState = "visible";
    host.document.dispatchEvent(new Event("visibilitychange"));
    host.flush();
    expect(frame.dataset.atlasActive).toBe("true");
    expect(frame.sourceAssignments).toBe(1);
    host.session.dispose();
  });

  it("accepts ready messages only from its own same-origin browsing context", () => {
    const host = harness();
    host.attach(host.placeholder());
    const iframe = host.iframe();
    const event = {
      origin: host.window.location.origin,
      source: iframe.contentWindow,
    } as unknown as MessageEvent;
    expect(host.session.ownsMessage(event)).toBe(true);
    expect(
      host.session.ownsMessage({
        ...event,
        origin: "https://other.example",
      } as MessageEvent),
    ).toBe(false);
    expect(
      host.session.ownsMessage({ ...event, source: null } as MessageEvent),
    ).toBe(false);
    expect(
      host.session.ownsMessage({ ...event, source: {} } as MessageEvent),
    ).toBe(false);
    host.session.announceVisibility();
    expect(iframe.contentWindow.postMessage).toHaveBeenLastCalledWith(
      { channel: WORKBENCH_CHANNEL, type: "host-visibility", active: true },
      host.window.location.origin,
    );
    host.session.dispose();
    expect(host.session.ownsMessage(event)).toBe(false);
  });

  it("destroys the browsing context only on unload and disconnects all owned observers and listeners", () => {
    const host = harness();
    const tab = host.placeholder();
    host.attach(tab);
    const frame = host.iframe();
    expect(host.frames.size).toBe(1);
    host.session.dispose();
    host.session.dispose();
    expect(frame.isConnected).toBe(false);
    expect(frame.disconnections).toBe(1);
    expect(host.frames.size).toBe(0);
    expect(
      host.observers.every((observer) => observer.observed.size === 0),
    ).toBe(true);
    expect(tab.dataset.atlasPlaceholder).toBeUndefined();
    host.window.dispatchEvent(new Event("resize"));
    host.document.dispatchEvent(new Event("scroll"));
    host.document.dispatchEvent(new Event("visibilitychange"));
    expect(host.frames.size).toBe(0);
    host.attach(host.placeholder());
    expect(
      host.document.created.filter((element) => element.tagName === "IFRAME"),
    ).toHaveLength(1);
  });
});
