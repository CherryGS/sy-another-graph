import { locale } from "../../../shared/i18n/runtime";
import { isNativeBlockId } from "./scope-menu";
import { NativeBlockPreview } from "./native-preview";
import { readSearchSnapshot, type SearchGraphSnapshot } from "../../../modules/search/model";

export const WORKBENCH_CHANNEL = "sy-another-graph";

/**
 * A plugin-owned browsing context. Tab panels are disposable positioning anchors;
 * the iframe itself is attached to the document exactly once until plugin unload.
 */
export class PersistentWorkbench {
  readonly sessionId = crypto.randomUUID();
  private readonly pluginName: string;
  private readonly anchors = new Set<HTMLElement>();
  private readonly resizeObserver: ResizeObserver;
  private readonly mutationObserver: MutationObserver;
  private observedAncestors = new Set<Element>();
  private container: HTMLDivElement | null = null;
  private frame: HTMLIFrameElement | null = null;
  private scheduled: number | null = null;
  private active = false;
  private disposed = false;
  private bounds = "";
  private pendingScopeId: string | null = null;
  private pendingSearch: SearchGraphSnapshot | null = null;
  private sourceVersion = 0;
  private preview: NativeBlockPreview | null = null;

  constructor(pluginName: string) {
    this.pluginName = pluginName;
    this.resizeObserver = new ResizeObserver(this.refresh);
    this.mutationObserver = new MutationObserver(this.refresh);
    window.addEventListener("resize", this.refresh);
    document.addEventListener("scroll", this.refresh, true);
    document.addEventListener("visibilitychange", this.refresh);
  }

  attach(anchor: HTMLElement): void {
    if (this.disposed) return;
    this.ensureFrame();
    anchor.dataset.atlasPlaceholder = this.sessionId;
    // Re-adding an existing anchor makes it the preferred visible host location.
    this.anchors.delete(anchor);
    this.anchors.add(anchor);
    this.synchronize();
    this.refresh();
  }

  detach(anchor: HTMLElement): void {
    this.anchors.delete(anchor);
    delete anchor.dataset.atlasPlaceholder;
    if (this.disposed) return;
    this.synchronize();
  }

  ownsMessage(event: MessageEvent): boolean {
    return (
      !this.disposed &&
      event.origin === window.location.origin &&
      this.frame?.contentWindow != null &&
      event.source === this.frame.contentWindow
    );
  }

  previewBlock(event: MessageEvent): void {
    if (this.active && this.ownsMessage(event)) this.preview?.handle(event.data);
  }

  /** Keep the latest explicit entry request until the child acknowledges it. */
  requestScope(id: string): void {
    if (this.disposed || !isNativeBlockId(id)) return;
    this.pendingScopeId = id;
    this.pendingSearch = null;
    this.postScope();
  }

  requestSearch(value: SearchGraphSnapshot): void {
    if (this.disposed) return;
    const snapshot = readSearchSnapshot(value);
    if (!snapshot) return;
    this.pendingScopeId = null;
    this.pendingSearch = snapshot;
    this.postSearch();
  }

  acknowledgeSearch(requestId: string): void {
    if (this.pendingSearch?.requestId === requestId) this.pendingSearch = null;
  }

  acknowledgeScope(id: string): void {
    if (!this.disposed && this.pendingScopeId === id) this.pendingScopeId = null;
  }

  /** Version changes only for confirmed source events, even before frame setup. */
  markSourceChanged(): void {
    if (this.disposed) return;
    this.sourceVersion++;
    this.postSourceVersion();
  }

  /** Respond to the child handshake even if visibility has not changed. */
  announceLanguage(): void {
    if (this.disposed) return;
    this.frame?.contentWindow?.postMessage(
      { channel: WORKBENCH_CHANNEL, type: "host-language", language: locale() },
      window.location.origin,
    );
  }

  announceVisibility(): void {
    if (this.disposed) return;
    this.announceLanguage();
    this.synchronize();
    this.postVisibility();
    this.postScope();
    this.postSearch();
    this.postSourceVersion();
  }

  refresh = (): void => {
    if (this.disposed || this.scheduled !== null) return;
    this.scheduled = window.requestAnimationFrame(() => {
      this.scheduled = null;
      this.synchronize();
    });
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.preview?.clear();
    this.preview = null;
    this.pendingScopeId = null;
    this.pendingSearch = null;
    if (this.scheduled !== null) window.cancelAnimationFrame(this.scheduled);
    this.scheduled = null;
    this.resizeObserver.disconnect();
    this.mutationObserver.disconnect();
    this.observedAncestors.clear();
    window.removeEventListener("resize", this.refresh);
    document.removeEventListener("scroll", this.refresh, true);
    document.removeEventListener("visibilitychange", this.refresh);
    for (const anchor of this.anchors) delete anchor.dataset.atlasPlaceholder;
    this.anchors.clear();
    this.frame?.removeEventListener("load", this.onFrameLoad);
    // Removing this one stable container is the sole destructive iframe action.
    this.container?.remove();
    this.container = null;
    this.frame = null;
  }

  private ensureFrame(): void {
    if (this.frame || this.disposed) return;
    const container = document.createElement("div");
    container.dataset.atlasSession = this.sessionId;
    container.dataset.atlasActive = "false";
    container.setAttribute("aria-hidden", "true");
    container.inert = true;
    // SiYuan starts its menu/dialog layer at zIndex 10; split handles use 6.
    // This surface stays above ordinary panel contents but below those controls.
    container.style.cssText =
      "position:fixed;left:0;top:0;width:1px;height:1px;z-index:1;overflow:hidden;visibility:hidden;pointer-events:none;background:#11121a;";
    const frame = document.createElement("iframe");
    frame.src = `/plugins/${encodeURIComponent(this.pluginName)}/ui/index.html?session=${this.sessionId}&lang=${locale()}#/`;
    frame.title = "一个思源图谱";
    frame.dataset.atlasSession = this.sessionId;
    frame.dataset.atlasActive = "false";
    frame.dataset.atlasLoadCount = "0";
    frame.tabIndex = -1;
    frame.style.cssText = "width:100%;height:100%;border:0;display:block;background:#11121a;";
    frame.addEventListener("load", this.onFrameLoad);
    container.appendChild(frame);
    document.body.appendChild(container);
    this.container = container;
    this.frame = frame;
    this.preview = new NativeBlockPreview(frame);
  }

  private onFrameLoad = (): void => {
    if (!this.frame || this.disposed) return;
    this.preview?.clear();
    this.frame.dataset.atlasLoadCount = String(Number(this.frame.dataset.atlasLoadCount) + 1);
    this.announceVisibility();
  };

  private synchronize(): void {
    if (this.disposed) return;
    this.observeAnchorAncestors();
    const container = this.container;
    const frame = this.frame;
    if (!container || !frame) return;
    let rect: DOMRect | null = null;
    if (document.visibilityState !== "hidden") {
      for (const anchor of Array.from(this.anchors).reverse()) {
        if (
          !anchor.isConnected ||
          anchor.ownerDocument !== document ||
          !anchor.getClientRects().length
        )
          continue;
        const visibility = window.getComputedStyle(anchor).visibility;
        if (visibility === "hidden" || visibility === "collapse") continue;
        const candidate = anchor.getBoundingClientRect();
        if (
          candidate.width <= 0 ||
          candidate.height <= 0 ||
          candidate.right <= 0 ||
          candidate.bottom <= 0 ||
          candidate.left >= window.innerWidth ||
          candidate.top >= window.innerHeight
        )
          continue;
        rect = candidate;
        break;
      }
    }
    const active = rect !== null;
    if (rect) {
      const bounds = `${rect.left},${rect.top},${rect.width},${rect.height}`;
      if (bounds !== this.bounds) {
        this.preview?.clear();
        container.style.left = `${rect.left}px`;
        container.style.top = `${rect.top}px`;
        container.style.width = `${rect.width}px`;
        container.style.height = `${rect.height}px`;
        this.bounds = bounds;
      }
    }
    if (active !== this.active) {
      this.active = active;
      if (!active) this.preview?.clear();
      if (!active && document.activeElement === frame) frame.blur();
      container.style.visibility = active ? "visible" : "hidden";
      container.style.pointerEvents = active ? "auto" : "none";
      container.inert = !active;
      container.setAttribute("aria-hidden", String(!active));
      container.dataset.atlasActive = String(active);
      frame.dataset.atlasActive = String(active);
      frame.tabIndex = active ? 0 : -1;
      this.postVisibility();
    }
    // A hidden/closed tab deliberately retains its last nonzero viewport. Never
    // set display:none, reset src, or move its iframe to a new tab panel.
  }

  private observeAnchorAncestors(): void {
    const ancestors = new Set<Element>();
    for (const anchor of this.anchors) {
      for (let element: HTMLElement | null = anchor; element; element = element.parentElement)
        ancestors.add(element);
    }
    if (
      ancestors.size === this.observedAncestors.size &&
      Array.from(ancestors).every((element) => this.observedAncestors.has(element))
    )
      return;
    this.resizeObserver.disconnect();
    this.mutationObserver.disconnect();
    for (const element of ancestors) {
      this.resizeObserver.observe(element);
      this.mutationObserver.observe(element, {
        attributes: true,
        attributeFilter: ["class", "style", "hidden"],
        childList: true,
      });
    }
    this.observedAncestors = ancestors;
  }

  private postVisibility(): void {
    this.frame?.contentWindow?.postMessage(
      {
        channel: WORKBENCH_CHANNEL,
        type: "host-visibility",
        active: this.active,
      },
      window.location.origin,
    );
  }

  private postScope(): void {
    if (!this.pendingScopeId) return;
    this.frame?.contentWindow?.postMessage(
      {
        channel: WORKBENCH_CHANNEL,
        type: "scope-graph",
        id: this.pendingScopeId,
      },
      window.location.origin,
    );
  }

  private postSourceVersion(): void {
    if (this.sourceVersion === 0) return;
    this.frame?.contentWindow?.postMessage(
      {
        channel: WORKBENCH_CHANNEL,
        type: "source-changed",
        version: this.sourceVersion,
      },
      window.location.origin,
    );
  }

  private postSearch(): void {
    if (!this.pendingSearch) return;
    this.frame?.contentWindow?.postMessage(
      {
        channel: WORKBENCH_CHANNEL,
        type: "search-graph",
        snapshot: this.pendingSearch,
      },
      window.location.origin,
    );
  }
}
