import type { GroupMotion } from "./position-adapter";

interface GestureTargets {
  window: EventTarget;
  document: EventTarget & { readonly visibilityState: string };
}
interface GestureScheduler {
  frame(callback: () => void): number;
  cancelFrame(id: number): void;
  now(): number;
}
export interface CanvasGestureOptions {
  active(): boolean;
  chosenIds(): readonly string[];
  nodeAt(event: MouseEvent): string | null;
  overRelationship(event: MouseEvent): boolean;
  pointerPosition(event: MouseEvent): [number, number] | undefined;
  begin(ids: readonly string[], origin: [number, number], grabbedId: string): GroupMotion;
  onStart(): void;
  onMove(): void;
  onEnd(moved: boolean): void;
  onClearChosen(): void;
  onError(error: unknown): void;
}

const consume = (event: Event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
};

/** Own Shift gestures while ordinary point dragging remains native. */
export class CanvasGestures {
  private pending?: {
    x: number;
    y: number;
    origin?: [number, number];
    ids?: readonly string[];
    grabbedId?: string;
    shift: boolean;
    moved: boolean;
  };
  private motion?: GroupMotion;
  private appliedMovement = false;
  private latestPosition?: [number, number];
  private frame?: number;
  private suppressClick = false;
  private suppressDoubleUntil = 0;
  private disposed = false;
  private readonly capture = { capture: true, passive: false };
  private readonly host: EventTarget;
  private readonly options: CanvasGestureOptions;
  private readonly targets: GestureTargets;
  private readonly scheduler: GestureScheduler;

  constructor(
    host: EventTarget,
    options: CanvasGestureOptions,
    targets: GestureTargets = { window, document },
    scheduler: GestureScheduler = {
      frame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (id) => window.cancelAnimationFrame(id),
      now: () => performance.now(),
    },
  ) {
    this.host = host;
    this.options = options;
    this.targets = targets;
    this.scheduler = scheduler;
    host.addEventListener("mousedown", this.down, this.capture);
    host.addEventListener("click", this.click, this.capture);
    host.addEventListener("dblclick", this.doubleClick, this.capture);
    targets.window.addEventListener("mousemove", this.move, this.capture);
    targets.window.addEventListener("mouseup", this.up, this.capture);
    targets.window.addEventListener("wheel", this.wheel, this.capture);
    targets.window.addEventListener("pointercancel", this.cancelEvent, this.capture);
    targets.window.addEventListener("blur", this.blur, this.capture);
    targets.document.addEventListener("visibilitychange", this.visibility);
  }

  private down = (raw: Event) => {
    const event = raw as MouseEvent;
    if (this.disposed || !this.options.active() || event.button !== 0) return;
    this.cancel();
    this.suppressClick = false;
    // This host capture runs before d3's canvas mousedown listeners. Cosmos rejects
    // Shift in its point-drag subject, then accepts it as zoom/pan. Reserve every
    // Shift press here, including nonmembers and blank canvas, before hit testing.
    if (event.shiftKey) consume(event);
    const id = event.shiftKey ? this.options.nodeAt(event) : null;
    const ids = this.options.chosenIds();
    const collective = event.shiftKey && id !== null && ids.includes(id);
    this.pending = {
      x: event.clientX,
      y: event.clientY,
      origin: collective ? this.options.pointerPosition(event) : undefined,
      ids: collective ? [...ids] : undefined,
      grabbedId: collective ? id : undefined,
      shift: event.shiftKey,
      moved: false,
    };
  };

  private move = (raw: Event) => {
    const event = raw as MouseEvent;
    const pending = this.pending;
    if (!pending || this.disposed) return;
    if (!this.options.active()) {
      this.cancel();
      return;
    }
    if (pending.shift) consume(event);
    if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < 3 && !pending.moved)
      return;
    pending.moved = true;
    this.suppressClick = true;
    this.suppressDoubleUntil = this.scheduler.now() + 500;
    if (!pending.ids || !pending.origin || !pending.grabbedId) return;
    try {
      if (!this.motion) {
        this.motion = this.options.begin(pending.ids, pending.origin, pending.grabbedId);
        this.options.onStart();
      }
      this.latestPosition = this.options.pointerPosition(event);
      if (this.frame === undefined)
        this.frame = this.scheduler.frame(() => {
          this.frame = undefined;
          this.flush();
        });
    } catch (error) {
      this.fail(error);
    }
  };

  private flush() {
    if (!this.motion || !this.latestPosition || !this.options.active()) return;
    try {
      this.motion.move(this.latestPosition);
      this.appliedMovement = true;
      this.latestPosition = undefined;
      this.options.onMove();
    } catch (error) {
      this.fail(error);
    }
  }

  private up = (raw: Event) => {
    if (!this.pending) return;
    if (this.pending.shift) consume(raw);
    if (this.motion) {
      this.flush();
    }
    this.finish();
  };

  private click = (event: Event) => {
    if (this.suppressClick) consume(event);
  };
  private wheel = (event: Event) => {
    // A collective drag owns one fixed camera-facing plane until release.
    if (this.pending?.shift) consume(event);
  };

  private doubleClick = (raw: Event) => {
    const event = raw as MouseEvent;
    if (!event.shiftKey || this.disposed || !this.options.active()) return;
    // No Shift-double-click may leak to d3's zoom-out action. Only blank canvas
    // exits the set; nodes and relationships retain their current state.
    consume(event);
    if (this.suppressClick || this.scheduler.now() < this.suppressDoubleUntil) {
      return;
    }
    if (this.options.nodeAt(event) !== null || this.options.overRelationship(event)) return;
    this.options.onClearChosen();
  };

  private finish() {
    if (this.frame !== undefined) this.scheduler.cancelFrame(this.frame);
    this.frame = undefined;
    const moved = this.appliedMovement;
    const collective = Boolean(this.motion);
    this.pending = undefined;
    this.motion = undefined;
    this.appliedMovement = false;
    this.latestPosition = undefined;
    if (collective) this.options.onEnd(moved);
  }

  cancel() {
    if (this.pending?.moved) {
      this.suppressClick = true;
      this.suppressDoubleUntil = this.scheduler.now() + 500;
    }
    this.finish();
  }

  private fail(error: unknown) {
    this.cancel();
    this.options.onError(error);
  }
  private cancelEvent = () => this.cancel();
  private blur = (event: Event) => {
    if (event.target === this.targets.window) this.cancel();
  };
  private visibility = () => {
    if (this.targets.document.visibilityState === "hidden") this.cancel();
  };

  dispose() {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    this.host.removeEventListener("mousedown", this.down, this.capture);
    this.host.removeEventListener("click", this.click, this.capture);
    this.host.removeEventListener("dblclick", this.doubleClick, this.capture);
    this.targets.window.removeEventListener("mousemove", this.move, this.capture);
    this.targets.window.removeEventListener("mouseup", this.up, this.capture);
    this.targets.window.removeEventListener("wheel", this.wheel, this.capture);
    this.targets.window.removeEventListener("pointercancel", this.cancelEvent, this.capture);
    this.targets.window.removeEventListener("blur", this.blur, this.capture);
    this.targets.document.removeEventListener("visibilitychange", this.visibility);
  }
}
