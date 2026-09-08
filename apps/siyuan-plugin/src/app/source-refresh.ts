export interface RefreshScheduler {
  delay(callback: () => void, milliseconds: number): number;
  cancel(id: number): void;
}

/** Visibility alone does not reload. New source revisions are coalesced until active. */
export class SourceRefresh {
  private latest = 0;
  private applied = 0;
  private failed = -1;
  private active = true;
  private loading = false;
  private disposed = false;
  private timer: number | undefined;
  private readonly reload: () => void;
  private readonly scheduler: RefreshScheduler;

  constructor(
    reload: () => void,
    scheduler: RefreshScheduler = {
      delay: (callback, delay) => window.setTimeout(callback, delay),
      cancel: (id) => window.clearTimeout(id),
    },
  ) {
    this.reload = reload;
    this.scheduler = scheduler;
  }

  sourceChanged(version: number) {
    if (
      this.disposed ||
      !Number.isSafeInteger(version) ||
      version <= this.latest
    )
      return;
    this.latest = version;
    this.cancelTimer();
    this.schedule();
  }

  setActive(active: boolean) {
    if (this.disposed) return;
    this.active = active;
    if (!active) this.cancelTimer();
    else this.schedule();
  }

  beginLoad() {
    this.cancelTimer();
    this.loading = true;
    return this.latest;
  }

  completeLoad(version: number, succeeded: boolean) {
    if (this.disposed) return;
    this.loading = false;
    if (succeeded) this.applied = Math.max(this.applied, version);
    else this.failed = Math.max(this.failed, version);
    this.schedule();
  }

  private schedule() {
    if (
      this.disposed ||
      !this.active ||
      this.loading ||
      this.timer !== undefined ||
      this.latest <= this.applied ||
      this.latest <= this.failed
    )
      return;
    this.timer = this.scheduler.delay(() => {
      this.timer = undefined;
      if (!this.disposed && this.active && !this.loading) this.reload();
    }, 350);
  }

  private cancelTimer() {
    if (this.timer !== undefined) this.scheduler.cancel(this.timer);
    this.timer = undefined;
  }

  dispose() {
    this.disposed = true;
    this.cancelTimer();
  }
}

export function subscribeSourceRefresh(target: Window, refresh: SourceRefresh) {
  let hostActive = true;
  const visibility = () =>
    refresh.setActive(
      hostActive && target.document.visibilityState !== "hidden",
    );
  const message = (event: MessageEvent) => {
    if (
      target.parent === target ||
      event.source !== target.parent ||
      event.origin !== target.location.origin
    )
      return;
    const data = event.data;
    if (data?.channel !== "sy-another-graph") return;
    if (data.type === "source-changed" && typeof data.version === "number")
      refresh.sourceChanged(data.version);
    if (data.type === "host-visibility" && typeof data.active === "boolean") {
      hostActive = data.active;
      visibility();
    }
  };
  target.addEventListener("message", message);
  target.document.addEventListener("visibilitychange", visibility);
  visibility();
  return () => {
    target.removeEventListener("message", message);
    target.document.removeEventListener("visibilitychange", visibility);
  };
}
