type LabelHost = Pick<HTMLElement, "setAttribute" | "removeAttribute">;

interface DragLabelGuardTargets {
  window: EventTarget;
  document: EventTarget & { readonly visibilityState: string };
}

/** Keep label overlays out of hit testing only during a native point drag. */
export class DragLabelGuard {
  private disposed = false;
  private readonly host: LabelHost;
  private readonly targets: DragLabelGuardTargets;
  private readonly capture = { capture: true };
  private readonly clearDrag = () => this.end();
  private readonly windowBlur = (event: Event) => {
    // Capture also sees focused buttons/inputs blur after mousedown starts a drag.
    // Only loss of the window itself interrupts the pointer gesture.
    if (event.target === this.targets.window) this.end();
  };
  private readonly visibilityChanged = () => {
    if (this.targets.document.visibilityState === "hidden") this.end();
  };

  constructor(
    host: LabelHost,
    targets: DragLabelGuardTargets = { window, document },
  ) {
    this.host = host;
    this.targets = targets;
    targets.window.addEventListener("blur", this.windowBlur, this.capture);
    targets.window.addEventListener("pointercancel", this.clearDrag, this.capture);
    targets.document.addEventListener("visibilitychange", this.visibilityChanged);
  }

  /** Call synchronously from the renderer's native onDragStart callback. */
  begin() {
    if (!this.disposed) this.host.setAttribute("data-point-dragging", "true");
  }

  /** Also call when the owning renderer is suspended or made inactive. */
  end() {
    if (!this.disposed) this.host.removeAttribute("data-point-dragging");
  }

  dispose() {
    if (this.disposed) return;
    this.end();
    this.disposed = true;
    this.targets.window.removeEventListener("blur", this.windowBlur, this.capture);
    this.targets.window.removeEventListener(
      "pointercancel",
      this.clearDrag,
      this.capture,
    );
    this.targets.document.removeEventListener(
      "visibilitychange",
      this.visibilityChanged,
    );
  }
}
