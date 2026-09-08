import type { Cosmograph, CosmographConfig } from "@cosmograph/cosmograph";
import type { GraphTableStore, UploadedGraph } from "./graph-tables";
import type { PreparedGraph } from "./prepare-graph";
import type { CanvasStats } from "./types";

type Renderer = Pick<
  Cosmograph,
  | "setConfig"
  | "reset"
  | "destroy"
  | "stats"
  | "pause"
  | "unpause"
  | "selectPoints"
  | "setFocusedPoint"
  | "fitView"
>;
type Tables = Pick<
  GraphTableStore,
  "stage" | "commit" | "discard" | "clear" | "active"
>;
export interface FrameScheduler {
  delay(callback: () => void, milliseconds: number): number;
  cancelDelay(id: number): void;
  frame(callback: () => void): number;
  cancelFrame(id: number): void;
}
const browserScheduler: FrameScheduler = {
  delay: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
  cancelDelay: (id) => window.clearTimeout(id),
  frame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
};

/** One queue owns source tables, GPU rebuilds, interactions, and final destruction. */
export class RendererSession {
  private readonly graph: Renderer;
  private readonly tables: Tables;
  private readonly drain: () => Promise<void>;
  private readonly closeDatabase: () => Promise<void>;
  private readonly reportError: (error: unknown) => void;
  private readonly scheduler: FrameScheduler;
  private queue: Promise<void> = Promise.resolve();
  private disposal: Promise<void> | undefined;
  private revision = 0;
  private closed = false;
  private ready = false;
  private currentData: PreparedGraph | null = null;
  private selectedId: string | null = null;
  private paused = false;
  private needsFit = false;
  private fitDelay: number | undefined;
  private fitFrame: number | undefined;

  constructor(
    graph: Renderer,
    tables: Tables,
    drain: () => Promise<void>,
    closeDatabase: () => Promise<void>,
    reportError: (error: unknown) => void,
    scheduler = browserScheduler,
  ) {
    this.graph = graph;
    this.tables = tables;
    this.drain = drain;
    this.closeDatabase = closeDatabase;
    this.reportError = reportError;
    this.scheduler = scheduler;
  }

  get displayed() {
    return this.currentData;
  }
  get counts() {
    return {
      nodes: this.graph.stats.pointsCount,
      links: this.graph.stats.linksCount,
    };
  }
  get isInteractive() {
    return (
      !this.closed && this.ready && (this.currentData?.pointsCount ?? 0) > 0
    );
  }

  initialize(config: CosmographConfig) {
    return this.enqueue(async () => {
      if (!this.closed)
        await this.graph.setConfig({ ...config, fitViewOnInit: false });
    });
  }

  /** Invalidate callbacks immediately, before a replacement's preparation has completed. */
  suspend() {
    this.revision++;
    this.ready = false;
    this.cancelFit();
  }

  update(
    data: PreparedGraph,
    config: CosmographConfig,
  ): Promise<CanvasStats | null> {
    this.suspend();
    const revision = this.revision;
    return this.enqueue(async () => {
      if (!this.isCurrent(revision)) return null;
      const started = performance.now();
      const dataChanged = this.currentData !== data;
      let uploaded: UploadedGraph | undefined;
      let configurationStarted = false;
      try {
        // Label/crossfilter reads have their own queues inside Cosmograph.
        await this.drain();
        if (!this.isCurrent(revision)) return null;
        if (data.pointsCount === 0) {
          await this.graph.reset(false);
          await this.drain();
          await this.tables.clear();
        } else {
          uploaded = await this.tables.stage(data);
          if (!this.isCurrent(revision)) {
            await this.tables.discard(uploaded);
            return null;
          }
          let rebuildError: Error | undefined;
          configurationStarted = true;
          await this.graph.setConfig({
            ...config,
            ...data.config,
            points: uploaded.points,
            links: uploaded.links,
            fitViewOnInit: false,
            onGraphRebuildError: (error) => {
              rebuildError = error;
            },
            onClick: (...args) => {
              if (this.isCurrent(revision) && this.isInteractive)
                config.onClick?.(...args);
            },
            onLabelClick: (...args) => {
              if (this.isCurrent(revision) && this.isInteractive)
                config.onLabelClick?.(...args);
            },
            onPointMouseOver: (...args) => {
              if (this.isCurrent(revision) && this.isInteractive)
                config.onPointMouseOver?.(...args);
            },
            onPointMouseOut: (...args) => {
              if (this.isCurrent(revision) && this.isInteractive)
                config.onPointMouseOut?.(...args);
            },
          });
          await this.drain();
          // The completed config references these tables, even when superseded meanwhile.
          await this.tables.commit(uploaded);
          if (rebuildError) throw rebuildError;
        }
        if (!this.isCurrent(revision)) return null;
        const stats = this.graph.stats;
        if (
          stats.pointsCount !== data.pointsCount ||
          stats.linksCount !== data.linksCount
        ) {
          throw new Error(
            `图谱未完整载入：应有 ${data.pointsCount.toLocaleString()} 个节点、${data.linksCount.toLocaleString()} 条连线；实际 ${stats.pointsCount.toLocaleString()} 个节点、${stats.linksCount.toLocaleString()} 条连线。请重试图谱。`,
          );
        }
        this.currentData = data;
        this.ready = true;
        this.applyControls();
        this.needsFit ||= dataChanged;
        this.scheduleFit(dataChanged ? 180 : 0);
        return {
          pointsCount: stats.pointsCount,
          linksCount: stats.linksCount,
          preparationMs: data.preparationMs,
          renderingMs: performance.now() - started,
        };
      } catch (error) {
        // Keep a failed config's source alive until the next config or destruction has drained it.
        if (uploaded && uploaded !== this.tables.active) {
          if (configurationStarted) await this.tables.commit(uploaded);
          else await this.tables.discard(uploaded);
        }
        if (!this.isCurrent(revision)) return null;
        this.ready = false;
        throw error;
      }
    });
  }

  controls(selectedId: string | null, paused: boolean) {
    if (this.closed) return;
    const changed = this.selectedId !== selectedId || this.paused !== paused;
    this.selectedId = selectedId;
    this.paused = paused;
    if (changed && this.isInteractive)
      this.runControl(() => this.applyControls());
  }

  fit() {
    if (this.closed) return;
    this.needsFit = true;
    this.scheduleFit(0);
  }

  dispose() {
    if (this.disposal) return this.disposal;
    this.closed = true;
    this.suspend();
    this.disposal = this.enqueue(async () => {
      const failures: unknown[] = [];
      try {
        await this.drain();
      } catch (error) {
        failures.push(error);
      }
      try {
        await this.graph.destroy();
      } catch (error) {
        failures.push(error);
      }
      try {
        await this.drain();
        await this.tables.clear();
      } catch (error) {
        failures.push(error);
      }
      try {
        await this.closeDatabase();
      } catch (error) {
        failures.push(error);
      }
      this.currentData = null;
      if (failures.length)
        throw new AggregateError(failures, "图谱资源清理失败。");
    });
    return this.disposal;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private isCurrent(revision: number) {
    return !this.closed && revision === this.revision;
  }

  private applyControls() {
    if (!this.isInteractive || !this.currentData) return;
    const index =
      this.selectedId === null
        ? undefined
        : this.currentData.idToIndex.get(this.selectedId);
    this.graph.selectPoints(index === undefined ? null : [index], false, true);
    this.graph.setFocusedPoint(index);
    if (this.paused) this.graph.pause();
    else this.graph.unpause();
  }

  private runControl(operation: () => void) {
    if (!this.isInteractive) return;
    try {
      operation();
    } catch (error) {
      this.ready = false;
      this.reportError(error);
    }
  }

  private cancelFit() {
    if (this.fitDelay !== undefined) this.scheduler.cancelDelay(this.fitDelay);
    if (this.fitFrame !== undefined) this.scheduler.cancelFrame(this.fitFrame);
    this.fitDelay = undefined;
    this.fitFrame = undefined;
  }

  private scheduleFit(delay: number) {
    if (!this.needsFit || !this.isInteractive) return;
    this.cancelFit();
    const revision = this.revision;
    this.fitDelay = this.scheduler.delay(() => {
      this.fitDelay = undefined;
      if (!this.isCurrent(revision) || !this.isInteractive) return;
      this.fitFrame = this.scheduler.frame(() => {
        this.fitFrame = undefined;
        if (!this.isCurrent(revision) || !this.isInteractive) return;
        this.needsFit = false;
        // Snap in our tracked frame; no untracked zoom transition may survive a rebuild.
        this.runControl(() => this.graph.fitView(0, 0.15));
      });
    }, delay);
  }
}
