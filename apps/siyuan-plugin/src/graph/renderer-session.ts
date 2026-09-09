import type { Cosmograph, CosmographConfig } from "@cosmograph/cosmograph";
import type { GraphTableStore, UploadedGraph } from "./graph-tables";
import type { PreparedGraph } from "./prepare-graph";
import type { CanvasStats } from "./types";
import type { CameraState, Dimensions } from "./geometry";
import { sampleLayoutBuffer, type LayoutMetrics } from "./layout-sampler";
import {
  captureNodePositions,
  captureViewport,
  measurePositionRestore,
  positionProbes,
  restoreNodePositions,
  restoreViewport,
  type NodePositions,
  type PositionProbe,
  type PositionRestore,
  type ViewportSnapshot,
  type ViewportApi,
} from "./position-adapter";

type Renderer = Pick<
  Cosmograph,
  | "setConfig"
  | "reset"
  | "destroy"
  | "stats"
  | "pause"
  | "unpause"
  | "start"
  | "selectPoints"
  | "setFocusedPoint"
  | "setPinnedPoints"
  | "fitViewByCoordinates"
  | "getPointPositions"
  | "isSimulationRunning"
  | "getZoomLevel"
  | "setZoomLevel"
> & ViewportApi;
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
  lastDataUpdateMs: number | null;
  dimensions: Dimensions;
  camera: CameraState | null;
  highlightedCount: number;
  outlinedCount: number;
  requestedHighlightCount: number;
  inspectedId: string | null;
  chosenIds: readonly string[];
  pinnedCount: number;
  dragCount: number;
  active: boolean;
  positionRestorations: number;
  restoredPointCount: number;
  positionWorldError: number | null;
  positionScreenError: number | null;
  positionSamples: PositionRestore["samples"];
  layoutBefore: PositionRestore["layoutBefore"] | null;
  layoutAfter: PositionRestore["layoutAfter"] | null;
  layoutSnapshot: LayoutMetrics | null;
  layoutSample: number;
  layoutSampledAt: number | null;
  layoutSimulationRunning: boolean | null;
  layoutDataRevision: number | null;
  zoomBefore: number | null;
  zoomAfter: number | null;
}
const browserScheduler: FrameScheduler = {
  delay: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
  cancelDelay: (id) => window.clearTimeout(id),
  frame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
};

function sameIds(left: readonly string[], right: readonly string[]) {
  const members = new Set(left);
  return (
    members.size === new Set(right).size && right.every((id) => members.has(id))
  );
}

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
  private chosenIds: readonly string[] = [];
  private spotlightIds: readonly string[] = [];
  private highlightedIds: readonly string[] = [];
  private selectionDirty = true;
  private pinsDirty = true;
  private active = true;
  private visibilityRevision = 0;
  private paused = false;
  private needsSimulationRestart = false;
  // Keep the first fit pending through empty or hidden initial views. Later data
  // replacements retain the camera unless the user explicitly calls fit().
  private needsFit = true;
  private fitRevision = 0;
  private fitDelay: number | undefined;
  private fitFrame: number | undefined;
  private refreshFrame: number | undefined;
  private lastViewport: ViewportSnapshot | null = null;
  // Keep latent Z through a later 2D projection, including subsequent data rebuilds.
  private coordinateStride: Dimensions = 2;
  private readonly diagnosticListeners = new Set<() => void>();
  private diagnosticState: RendererDiagnostics = {
    sessionId: `renderer-${crypto.randomUUID()}`,
    configurations: 0,
    dataRevisions: 0,
    lastDataUpdateMs: null,
    dimensions: 2,
    camera: null,
    highlightedCount: 0,
    outlinedCount: 0,
    requestedHighlightCount: 0,
    inspectedId: null,
    chosenIds: [],
    pinnedCount: 0,
    dragCount: 0,
    active: true,
    positionRestorations: 0,
    restoredPointCount: 0,
    positionWorldError: null,
    positionScreenError: null,
    positionSamples: [],
    layoutBefore: null,
    layoutAfter: null,
    layoutSnapshot: null,
    layoutSample: 0,
    layoutSampledAt: null,
    layoutSimulationRunning: null,
    layoutDataRevision: null,
    zoomBefore: null,
    zoomAfter: null,
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
  get positionDimensions(): Dimensions {
    return this.coordinateStride;
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
      let positionsBefore: NodePositions | null = null;
      let probes: PositionProbe[] = [];
      let continuity: PositionRestore | null = null;
      let viewportBefore: ViewportSnapshot | null = null;
      try {
        // Label/crossfilter reads have their own queues inside Cosmograph.
        await this.drain();
        if (!this.isCurrent(revision)) return null;
        // The active tables identify the actual GPU topology, including a completed
        // configuration that was superseded before it could be published to React.
        const previousData = this.tables.active?.prepared;
        const replacesPoints = previousData !== data;
        if (replacesPoints && previousData && previousData.pointsCount > 0) {
          this.graph.pause();
          positionsBefore = captureNodePositions(this.graph, previousData.indexToId, this.coordinateStride);
          const chosenProbes = this.chosenIds.filter((id) => positionsBefore!.has(id));
          probes = positionProbes(this.graph, positionsBefore, chosenProbes.length ? chosenProbes : previousData.indexToId);
          viewportBefore = captureViewport(this.graph);
          if (viewportBefore) this.lastViewport = viewportBefore;
        }
        const viewportToRestore = replacesPoints ? this.lastViewport : null;
        if (data.pointsCount === 0) {
          await this.graph.reset(false);
          await this.drain();
          await this.tables.clear();
          this.publishDiagnostics({
            highlightedCount: 0,
            outlinedCount: 0,
            requestedHighlightCount: 0,
            inspectedId: null,
            chosenIds: [],
            pinnedCount: 0,
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
          outlinedIndices = this.chosenIndices(data);
          appliedConfig = {
            ...data.config,
            ...config,
            points: uploaded.points,
            links: uploaded.links,
            fitViewOnInit: false,
            // Native preservation copies coordinates before rebuilding Cosmos but
            // cannot preserve its 2D camera and may rescale copied coordinates.
            preservePointPositionsOnDataUpdate: false,
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
            onLinkClick: (...args) => {
              if (this.isCurrent(revision) && this.isInteractive)
                config.onLinkClick?.(...args);
            },
            onLinkMouseOver: (...args) => {
              if (this.isCurrent(revision) && this.isInteractive)
                config.onLinkMouseOver?.(...args);
            },
            onLinkMouseOut: (...args) => {
              if (this.isCurrent(revision) && this.isInteractive)
                config.onLinkMouseOut?.(...args);
            },
            onPointMouseOver: (...args) => {
              if (this.isCurrent(revision) && this.isInteractive)
                config.onPointMouseOver?.(...args);
            },
            onPointMouseOut: (...args) => {
              if (this.isCurrent(revision) && this.isInteractive)
                config.onPointMouseOut?.(...args);
            },
            onSimulationTick: (...args) => {
              if (this.isCurrent(revision) && this.isInteractive)
                config.onSimulationTick?.(...args);
            },
            onZoom: (...args) => {
              if (this.isCurrent(revision) && this.isInteractive)
                config.onZoom?.(...args);
            },
            onResize: (...args) => {
              if (this.isCurrent(revision) && this.isInteractive)
                config.onResize?.(...args);
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
          if (appliedConfig.spaceDimensions === 3) this.coordinateStride = 3;
          if (this.paused || !this.active) this.graph.pause();
          await this.drain();
          // The completed config references these tables, even when superseded meanwhile.
          await this.tables.commit(uploaded);
          if (rebuildError) throw rebuildError;
          if (!this.closed && replacesPoints && (positionsBefore || viewportToRestore)) {
            // Finish continuity for this actual table revision even when another
            // update is queued. The next job must read matching IDs and coordinates.
            this.graph.pause();
            this.graph.setPinnedPoints(this.chosenIndices(data));
            if (positionsBefore)
              restoreNodePositions(this.graph, data.indexToId, positionsBefore, this.coordinateStride);
            if (viewportToRestore) restoreViewport(this.graph, viewportToRestore);
            // Programmatic zoom may enable simulation; applyControls later restores
            // the current user/visibility state after the readback is complete.
            this.graph.pause();
            if (positionsBefore) {
              const after = captureNodePositions(this.graph, data.indexToId, this.coordinateStride);
              continuity = measurePositionRestore(this.graph, positionsBefore, after, probes);
            }
          }
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
        const forceKeys = ["simulationRepulsion", "simulationGravity", "simulationLinkDistance", "simulationLinkSpring", "simulationFriction", "simulationCollision", "simulationCollisionPadding", "simulationDecay"] as const;
        if (!dataChanged && this.currentConfig && appliedConfig && forceKeys.some((key) => this.currentConfig![key] !== appliedConfig![key]))
          this.needsSimulationRestart = true;
        this.currentConfig = appliedConfig;
        this.desiredOutlines = outlinedIndices;
        this.publishDiagnostics({
          outlinedCount: outlinedIndices.length,
          dimensions: this.graph.is3D ? 3 : 2,
          camera: this.graph.is3D ? (this.graph.getCameraState?.() ?? null) : null,
          positionRestorations: this.diagnosticState.positionRestorations + (continuity ? 1 : 0),
          restoredPointCount: continuity?.restored ?? 0,
          positionWorldError: continuity?.maximumWorldError ?? null,
          positionScreenError: continuity?.maximumScreenError ?? null,
          positionSamples: continuity?.samples ?? [],
          ...(continuity ? { layoutBefore: continuity.layoutBefore, layoutAfter: continuity.layoutAfter } : {}),
          zoomBefore: viewportBefore?.dimensions === 2 ? viewportBefore.zoom : viewportToRestore?.dimensions === 2 ? viewportToRestore.zoom : null,
          zoomAfter: this.graph.is3D ? null : (this.graph.getZoomLevel() ?? null),
        });
        this.ready = true;
        if (dataChanged)
          this.publishDiagnostics({
            dataRevisions: this.diagnosticState.dataRevisions + 1,
          });
        this.selectionDirty = true;
        this.pinsDirty = true;
        this.applyControls();
        this.scheduleFit(dataChanged ? 180 : 0);
        const renderingMs = performance.now() - started;
        if (dataChanged) this.publishDiagnostics({ lastDataUpdateMs: renderingMs });
        return {
          pointsCount: stats.pointsCount,
          linksCount: stats.linksCount,
          preparationMs: data.preparationMs,
          renderingMs,
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
    chosenIds: readonly string[] = [],
    spotlightIds: readonly string[] = [],
  ) {
    if (this.closed) return;
    const chosenChanged = !sameIds(this.chosenIds, chosenIds);
    const selectionChanged =
      this.selectedId !== selectedId ||
      !sameIds(this.highlightedIds, highlightedIds) ||
      !sameIds(this.spotlightIds, spotlightIds) ||
      chosenChanged;
    const changed = selectionChanged || this.paused !== paused;
    this.selectionDirty ||= selectionChanged;
    this.pinsDirty ||= chosenChanged;
    this.selectedId = selectedId;
    this.highlightedIds = [...highlightedIds];
    this.chosenIds = [...new Set(chosenIds)];
    this.spotlightIds = [...spotlightIds];
    this.paused = paused;
    if (changed && this.hasData) this.runControl(() => this.applyControls());
  }

  /** The custom Shift drag shares diagnostics and pause restoration with native dragging. */
  groupDragFinished(moved: boolean) {
    if (!this.hasData) return;
    if (moved && this.active)
      this.publishDiagnostics({
        dragCount: this.diagnosticState.dragCount + 1,
      });
    if (this.paused || !this.active) this.runControl(() => this.graph.pause());
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
        // Reapply the public camera state to redraw a settled/paused layout.
        this.runControl(() => {
          if (this.graph.is3D) {
            const viewport = captureViewport(this.graph);
            if (viewport) restoreViewport(this.graph, viewport);
          } else {
            const zoom = this.graph.getZoomLevel();
            if (zoom !== undefined && Number.isFinite(zoom) && zoom > 0)
              this.graph.setZoomLevel(zoom, 0);
          }
          if (this.paused || !this.active) this.graph.pause();
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
      this.lastViewport = null;
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
      for (const id of [
        ...this.chosenIds,
        ...this.spotlightIds,
        ...this.highlightedIds,
      ]) {
        const highlighted = this.currentData.idToIndex.get(id);
        if (highlighted !== undefined) selected.add(highlighted);
      }
      // Cosmograph selection is only a visual mask. It never defines our chosen/fixed set.
      this.graph.selectPoints(
        selected.size ? [...selected] : null,
        false,
        true,
      );
      this.graph.setFocusedPoint(this.inspectionFocusIndex());
      this.scheduleOutlines(this.chosenIndices(this.currentData));
      this.publishDiagnostics({
        requestedHighlightCount: selected.size,
        inspectedId:
          index === undefined ? null : this.currentData.indexToId[index],
      });
      this.selectionDirty = false;
    }
    if (this.active && this.pinsDirty) {
      const indices = this.chosenIndices(this.currentData);
      this.graph.setPinnedPoints(indices);
      this.publishDiagnostics({
        chosenIds: indices.map((index) => this.currentData!.indexToId[index]),
        pinnedCount: indices.length,
      });
      this.pinsDirty = false;
    }
    if (this.paused || !this.active) this.graph.pause();
    else if (this.needsSimulationRestart) {
      this.needsSimulationRestart = false;
      this.graph.start(0.3);
    } else this.graph.unpause();
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

  private chosenIndices(data: PreparedGraph) {
    const indices = new Set<number>();
    for (const id of this.chosenIds) {
      const index = data.idToIndex.get(id);
      if (index !== undefined) indices.add(index);
    }
    return [...indices].sort((left, right) => left - right);
  }

  private inspectionFocusIndex() {
    // Inspecting one chosen member must not replace its common chosen outline
    // with the visually stronger native focus ring.
    if (this.selectedId === null || this.chosenIds.includes(this.selectedId))
      return undefined;
    return this.currentData?.idToIndex.get(this.selectedId);
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
      this.graph.setFocusedPoint(this.inspectionFocusIndex());
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
        // Replace fitView's own readback with one shared by fitting and diagnostics.
        // These public coordinate-fit APIs change only the camera, not topology or alpha.
        this.runControl(() => {
          const dimensions = this.graph.is3D ? 3 : 2;
          const wasRunning = this.graph.isSimulationRunning;
          const positions = this.graph.getPointPositions({ dimensions });
          if (!positions?.length) return;
          const layoutSampledAt = performance.now();
          const layoutSnapshot = sampleLayoutBuffer(positions, dimensions);
          if (dimensions === 3) this.graph.fitViewByCoordinates(Array.from(positions), 0, 0.15);
          else this.graph.setZoomTransformByPointPositions(positions, 0, undefined, 0.15);
          // Also preserve a naturally settled layout, independent of the user's pause toggle.
          if (wasRunning === false && Boolean(this.graph.isSimulationRunning)) this.graph.pause();
          this.publishDiagnostics({ layoutSnapshot, layoutSample: this.diagnosticState.layoutSample + 1, layoutSampledAt, layoutSimulationRunning: wasRunning ?? null, layoutDataRevision: this.diagnosticState.dataRevisions });
        });
      });
    }, delay);
  }
}
