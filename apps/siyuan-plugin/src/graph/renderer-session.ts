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
  | "getZoomLevel"
  | "setZoomLevel"
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
export interface RendererDiagnostics {
  sessionId: string;
  configurations: number;
  dataRevisions: number;
  highlightedCount: number;
  outlinedCount: number;
  requestedHighlightCount: number;
  selectedRootId: string | null;
  dragCount: number;
  active: boolean;
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
  private currentConfig: CosmographConfig | null = null;
  private desiredOutlines: readonly number[] = [];
  private outlineRevision = 0;
  private selectedId: string | null = null;
  private highlightedIds: readonly string[] = [];
  private selectionDirty = true;
  private active = true;
  private visibilityRevision = 0;
  private paused = false;
  private needsFit = false;
  private fitRevision = 0;
  private fitDelay: number | undefined;
  private fitFrame: number | undefined;
  private refreshFrame: number | undefined;
  private readonly diagnosticListeners = new Set<() => void>();
  private diagnosticState: RendererDiagnostics = {
    sessionId: `renderer-${crypto.randomUUID()}`,
    configurations: 0,
    dataRevisions: 0,
    highlightedCount: 0,
    outlinedCount: 0,
    requestedHighlightCount: 0,
    selectedRootId: null,
    dragCount: 0,
    active: true,
  };

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
  getDiagnostics = () => this.diagnosticState;
  subscribe = (listener: () => void) => {
    this.diagnosticListeners.add(listener);
    return () => {
      this.diagnosticListeners.delete(listener);
    };
  };
  get counts() {
    return {
      nodes: this.graph.stats.pointsCount,
      links: this.graph.stats.linksCount,
    };
  }
  get isInteractive() {
    return this.active && this.hasData;
  }
  private get hasData() {
    return (
      !this.closed && this.ready && (this.currentData?.pointsCount ?? 0) > 0
    );
  }

  initialize(config: CosmographConfig) {
    return this.enqueue(async () => {
      if (!this.closed) {
        await this.graph.setConfig({ ...config, fitViewOnInit: false });
        this.publishDiagnostics({
          configurations: this.diagnosticState.configurations + 1,
        });
      }
    });
  }

  /** Invalidate callbacks immediately, before a replacement's preparation has completed. */
  suspend() {
    this.revision++;
    this.ready = false;
    this.cancelFit();
    this.cancelRefresh();
    this.outlineRevision++;
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
      let appliedConfig: CosmographConfig | null = null;
      let outlinedIndices: number[] = [];
      try {
        // Label/crossfilter reads have their own queues inside Cosmograph.
        await this.drain();
        if (!this.isCurrent(revision)) return null;
        if (data.pointsCount === 0) {
          await this.graph.reset(false);
          await this.drain();
          await this.tables.clear();
          this.publishDiagnostics({
            highlightedCount: 0,
            outlinedCount: 0,
            requestedHighlightCount: 0,
            selectedRootId: null,
          });
        } else {
          uploaded = await this.tables.stage(data);
          if (!this.isCurrent(revision)) {
            await this.tables.discard(uploaded);
            return null;
          }
          let rebuildError: Error | undefined;
          let dragMoved = false;
          configurationStarted = true;
          outlinedIndices = this.neighborIndices(data);
          appliedConfig = {
            ...data.config,
            ...config,
            points: uploaded.points,
            links: uploaded.links,
            fitViewOnInit: false,
            outlinedPointIndices: outlinedIndices,
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
            onDragStart: (...args) => {
              dragMoved = false;
              if (this.isCurrent(revision) && this.isInteractive)
                config.onDragStart?.(...args);
            },
            onDrag: (...args) => {
              if (!this.isCurrent(revision) || !this.isInteractive) return;
              dragMoved ||= Math.abs(args[0].dx) + Math.abs(args[0].dy) > 0;
              config.onDrag?.(...args);
            },
            onDragEnd: (...args) => {
              if (!this.isCurrent(revision)) return;
              try {
                if (this.isInteractive) {
                  if (dragMoved)
                    this.publishDiagnostics({
                      dragCount: this.diagnosticState.dragCount + 1,
                    });
                  config.onDragEnd?.(...args);
                }
              } finally {
                dragMoved = false;
                // Cosmos reheats even paused layouts at drag start and does not restore pause.
                // Its remaining drag-end handlers only redraw, so this is the final simulation state.
                if (this.paused || !this.active)
                  this.runControl(() => this.graph.pause());
              }
            },
            onPointsFiltered: (...args) => {
              if (!this.isCurrent(revision) || !this.hasData) return;
              this.publishDiagnostics({
                highlightedCount: args[1]?.length ?? 0,
              });
              config.onPointsFiltered?.(...args);
            },
          };
          await this.graph.setConfig(appliedConfig);
          await this.drain();
          // The completed config references these tables, even when superseded meanwhile.
          await this.tables.commit(uploaded);
          if (rebuildError) throw rebuildError;
          this.publishDiagnostics({
            configurations: this.diagnosticState.configurations + 1,
          });
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
        this.currentConfig = appliedConfig;
        this.desiredOutlines = outlinedIndices;
        this.publishDiagnostics({ outlinedCount: outlinedIndices.length });
        this.ready = true;
        if (dataChanged)
          this.publishDiagnostics({
            dataRevisions: this.diagnosticState.dataRevisions + 1,
          });
        this.selectionDirty = true;
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

  controls(
    selectedId: string | null,
    paused: boolean,
    highlightedIds: readonly string[] = [],
  ) {
    if (this.closed) return;
    const selectionChanged =
      this.selectedId !== selectedId ||
      this.highlightedIds.length !== highlightedIds.length ||
      this.highlightedIds.some((id, index) => id !== highlightedIds[index]);
    const changed = selectionChanged || this.paused !== paused;
    this.selectionDirty ||= selectionChanged;
    this.selectedId = selectedId;
    this.highlightedIds = [...highlightedIds];
    this.paused = paused;
    if (changed && this.hasData) this.runControl(() => this.applyControls());
  }

  /** Visibility never invalidates data, rebuilds the graph, or resets the camera. */
  setActive(active: boolean) {
    if (this.closed || this.active === active) return;
    this.active = active;
    this.publishDiagnostics({ active });
    this.visibilityRevision++;
    this.cancelFit();
    this.cancelRefresh();
    this.runControl(() => this.applyControls());
    if (active && this.hasData) {
      const revision = this.revision;
      const visibilityRevision = this.visibilityRevision;
      this.refreshFrame = this.scheduler.frame(() => {
        if (
          !this.isCurrent(revision) ||
          visibilityRevision !== this.visibilityRevision ||
          !this.isInteractive
        )
          return;
        this.refreshFrame = undefined;
        // The supported zoom setter requests a frame even for a settled/paused layout.
        // With a mounted, fixed-size viewport, the same zoom preserves its camera transform.
        this.runControl(() => {
          const zoom = this.graph.getZoomLevel();
          if (zoom !== undefined && Number.isFinite(zoom) && zoom > 0)
            this.graph.setZoomLevel(zoom, 0);
        });
        this.scheduleFit(0);
      });
    }
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
      this.currentConfig = null;
      this.diagnosticListeners.clear();
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
    if (!this.hasData || !this.currentData) return;
    if (this.active && this.selectionDirty) {
      const index =
        this.selectedId === null
          ? undefined
          : this.currentData.idToIndex.get(this.selectedId);
      const selected = new Set<number>();
      if (index !== undefined) selected.add(index);
      for (const id of this.highlightedIds) {
        const highlighted = this.currentData.idToIndex.get(id);
        if (highlighted !== undefined) selected.add(highlighted);
      }
      // This selects internal links too; unlike selectPoint(), it does not expand the nodes.
      this.graph.selectPoints(
        selected.size ? [...selected] : null,
        false,
        true,
      );
      this.graph.setFocusedPoint(index);
      this.scheduleOutlines(this.neighborIndices(this.currentData));
      this.publishDiagnostics({
        requestedHighlightCount: selected.size,
        selectedRootId:
          index === undefined ? null : this.currentData.indexToId[index],
      });
      this.selectionDirty = false;
    }
    if (this.paused || !this.active) this.graph.pause();
    else this.graph.unpause();
  }

  private runControl(operation: () => void) {
    if (!this.hasData) return;
    try {
      operation();
    } catch (error) {
      this.ready = false;
      this.reportError(error);
    }
  }

  private neighborIndices(data: PreparedGraph) {
    const indices = new Set<number>();
    for (const id of this.highlightedIds) {
      const index = data.idToIndex.get(id);
      if (id !== this.selectedId && index !== undefined) indices.add(index);
    }
    return [...indices];
  }

  private scheduleOutlines(indices: number[]) {
    if (
      indices.length === this.desiredOutlines.length &&
      indices.every(
        (index, position) => index === this.desiredOutlines[position],
      )
    )
      return;
    this.desiredOutlines = indices;
    const revision = this.revision;
    const outlineRevision = ++this.outlineRevision;
    void this.enqueue(async () => {
      if (
        !this.isCurrent(revision) ||
        outlineRevision !== this.outlineRevision ||
        !this.hasData ||
        !this.currentConfig
      )
        return;
      // This changes only Cosmos's outline mask; all data columns and source tables retain identity.
      const config = { ...this.currentConfig, outlinedPointIndices: indices };
      await this.graph.setConfig(config);
      this.publishDiagnostics({
        configurations: this.diagnosticState.configurations + 1,
      });
      if (!this.isCurrent(revision)) return;
      this.currentConfig = config;
      this.graph.setFocusedPoint(
        this.selectedId === null
          ? undefined
          : this.currentData?.idToIndex.get(this.selectedId),
      );
      this.publishDiagnostics({ outlinedCount: indices.length });
    }).catch((error: unknown) => {
      if (this.isCurrent(revision)) {
        this.ready = false;
        this.reportError(error);
      }
    });
  }

  private publishDiagnostics(change: Partial<RendererDiagnostics>) {
    this.diagnosticState = { ...this.diagnosticState, ...change };
    for (const listener of this.diagnosticListeners) listener();
  }

  private cancelFit() {
    this.fitRevision++;
    if (this.fitDelay !== undefined) this.scheduler.cancelDelay(this.fitDelay);
    if (this.fitFrame !== undefined) this.scheduler.cancelFrame(this.fitFrame);
    this.fitDelay = undefined;
    this.fitFrame = undefined;
  }

  private cancelRefresh() {
    if (this.refreshFrame !== undefined)
      this.scheduler.cancelFrame(this.refreshFrame);
    this.refreshFrame = undefined;
  }

  private scheduleFit(delay: number) {
    if (!this.needsFit || !this.isInteractive) return;
    this.cancelFit();
    const revision = this.revision;
    const fitRevision = this.fitRevision;
    this.fitDelay = this.scheduler.delay(() => {
      if (
        !this.isCurrent(revision) ||
        fitRevision !== this.fitRevision ||
        !this.isInteractive
      )
        return;
      this.fitDelay = undefined;
      this.fitFrame = this.scheduler.frame(() => {
        if (
          !this.isCurrent(revision) ||
          fitRevision !== this.fitRevision ||
          !this.isInteractive
        )
          return;
        this.fitFrame = undefined;
        this.needsFit = false;
        // Snap in our tracked frame; no untracked zoom transition may survive a rebuild.
        this.runControl(() => this.graph.fitView(0, 0.15));
      });
    }, delay);
  }
}
