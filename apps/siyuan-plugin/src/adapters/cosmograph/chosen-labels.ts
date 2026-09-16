import { t, locale } from "../../shared/i18n/runtime";
import type { PreparedGraph } from "./prepare-graph";
import type { CanvasNode } from "../../workbench/presentation/types";
import { SEARCH_ORIGIN_LABELS } from "../../workbench/presentation/search-origins";
import { searchNodeOrigin } from "../../modules/search/origins";
import {
  pointAt,
  projectPosition,
  type AsyncPointGeometry,
  type Dimensions,
  type PointPosition,
} from "./geometry";
interface LabelScheduler {
  frame(callback: () => void): number;
  cancelFrame(id: number): void;
  now(): number;
}

type PositionReadKind = "all" | "moving";
interface PositionRead {
  controller: AbortController;
  generation: number;
  data: PreparedGraph;
  dimensions: Dimensions;
  kind: PositionReadKind;
  startedAt: number;
}

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/** App-owned labels have no count limit or collision culling. Source titles remain literal text. */
export class ChosenLabels {
  private readonly layer: HTMLDivElement;
  private readonly labels = new Map<string, HTMLButtonElement>();
  private language = locale();
  private data: PreparedGraph | null = null;
  private ids: readonly string[] = [];
  private frame?: number;
  private active = true;
  private disposed = false;
  private readonly geometry: AsyncPointGeometry;
  private readonly positions = new Map<string, PointPosition>();
  private chosen: ReadonlySet<string> = new Set();
  private spotlight: ReadonlySet<string> = new Set();
  private readKind: PositionReadKind | null = "all";
  private pending?: PositionRead;
  private generation = 0;
  private projectionDirty = true;
  private readFailed = false;
  private reportedFailure = false;
  private abortRetries = 0;
  private nextMovingReadAt = 0;
  private hasMovingLabels = false;
  private positionDimensions: Dimensions = 2;
  private readonly onClick: (id: string, event: MouseEvent) => void;
  private readonly onHover: (node: CanvasNode | null) => void;
  private readonly scheduler: LabelScheduler;
  private readonly reportError: (failure: unknown) => void;

  constructor(
    host: HTMLElement,
    geometry: AsyncPointGeometry,
    onClick: (id: string, event: MouseEvent) => void,
    onHover: (node: CanvasNode | null) => void,
    scheduler: LabelScheduler = {
      frame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (id) => window.cancelAnimationFrame(id),
      now: () => performance.now(),
    },
    reportError: (failure: unknown) => void = (failure) =>
      console.warn("Graph label positions could not be refreshed", failure),
  ) {
    this.geometry = geometry;
    this.onClick = onClick;
    this.onHover = onHover;
    this.scheduler = scheduler;
    this.reportError = reportError;
    this.layer = host.ownerDocument.createElement("div");
    this.layer.className = "ag-canvas__chosen-labels";
    host.appendChild(this.layer);
  }

  update(data: PreparedGraph | null, ids: readonly string[], spotlightIds: readonly string[] = []) {
    if (this.disposed) return;
    const chosen = new Set(ids.filter((id) => data?.idToIndex.has(id)));
    const spotlight = new Set(spotlightIds.filter((id) => data?.idToIndex.has(id)));
    const dimensions = this.geometry.is3D ? 3 : 2;
    if (
      data === this.data &&
      sameIds(chosen, this.chosen) &&
      sameIds(spotlight, this.spotlight) &&
      dimensions === this.positionDimensions &&
      this.language === locale()
    )
      return;

    this.invalidate(data !== this.data || dimensions !== this.positionDimensions);
    this.language = locale();
    this.data = data;
    this.chosen = chosen;
    this.spotlight = spotlight;
    this.positionDimensions = dimensions;
    this.ids = [...new Set([...chosen, ...spotlight])];
    this.hasMovingLabels = this.ids.some((id) => !chosen.has(id));
    const retained = new Set(this.ids);
    for (const [id, label] of this.labels) {
      if (!retained.has(id)) {
        label.remove();
        this.labels.delete(id);
        this.positions.delete(id);
      }
    }
    for (const id of this.ids) {
      let label = this.labels.get(id);
      if (!label) {
        label = this.layer.ownerDocument.createElement("button");
        label.type = "button";
        label.className = "ag-canvas__chosen-label";
        label.style.visibility = "hidden";
        label.dataset.graphNodeId = id;
        label.addEventListener("click", (event) => {
          if (this.isCurrentLabel(id, label!) && this.data?.idToIndex.has(id))
            this.onClick(id, event);
        });
        const inspect = () => {
          const index = this.data?.idToIndex.get(id);
          if (this.isCurrentLabel(id, label!) && index !== undefined)
            this.onHover(this.data?.indexToNode[index] ?? null);
        };
        const clearHover = () => {
          if (this.isCurrentLabel(id, label!)) this.onHover(null);
        };
        label.addEventListener("mouseenter", inspect);
        label.addEventListener("focus", inspect);
        label.addEventListener("mouseleave", clearHover);
        label.addEventListener("blur", clearHover);
        this.labels.set(id, label);
        this.layer.appendChild(label);
      }
      const index = data!.idToIndex.get(id)!;
      label.className = chosen.has(id)
        ? "ag-canvas__chosen-label"
        : "ag-canvas__chosen-label ag-canvas__chosen-label--spotlight";
      const origin = searchNodeOrigin(id, data!.searchOrigins);
      label.textContent = data!.indexToLabel[index];
      label.setAttribute(
        "aria-label",
        t("text.valueValueValue", {
          p0: chosen.has(id) ? t("text.selected") : t("text.relationshipEndpoint"),
          p1: origin ? `（${SEARCH_ORIGIN_LABELS[origin]}）` : "",
          p2: data!.indexToLabel[index],
        }),
      );
    }
    this.refresh();
  }

  /** A stopped simulation has no future tick to flush moving labels after cooldown. */
  refreshAfterSimulation() {
    if (!this.disposed && this.active && this.hasMovingLabels) this.refresh();
  }

  refresh(kind: "positions" | "projection" | "simulation" = "positions") {
    if (this.disposed) return;
    const dimensionsChanged = this.syncDimensions();
    // Chosen points are pinned. Simulation frames cannot change their coordinates.
    // Only the explicitly temporary, unpinned endpoint labels need tick readbacks.
    if (
      kind === "simulation" &&
      (this.readFailed || (!this.hasMovingLabels && !dimensionsChanged && this.readKind !== "all"))
    )
      return;
    if (kind === "positions") {
      this.readFailed = false;
      this.abortRetries = 0;
      this.readKind = "all";
    } else if (kind === "simulation" && this.readKind !== "all") this.readKind = "moving";
    if (kind !== "simulation") this.projectionDirty = true;
    this.schedule();
  }

  private schedule() {
    if (
      this.disposed ||
      !this.active ||
      !this.ids.length ||
      !this.data ||
      this.frame !== undefined ||
      (!this.projectionDirty && !this.canRead())
    )
      return;
    const generation = this.generation;
    this.frame = this.scheduler.frame(() => {
      if (this.disposed || generation !== this.generation) return;
      this.frame = undefined;
      if (!this.active || !this.data) return;
      this.syncDimensions();
      if (this.readKind && this.canRead()) {
        const read: PositionRead = {
          controller: new AbortController(),
          generation: this.generation,
          data: this.data,
          dimensions: this.positionDimensions,
          kind: this.readKind,
          startedAt: this.scheduler.now(),
        };
        this.readKind = null;
        this.pending = read;
        void this.readPositions(read);
      }
      if (this.projectionDirty) {
        this.projectionDirty = false;
        this.draw();
      }
    });
  }

  private canRead() {
    return (
      this.readKind &&
      !this.pending &&
      !this.readFailed &&
      (this.readKind === "all" || this.scheduler.now() >= this.nextMovingReadAt)
    );
  }

  private async readPositions(read: PositionRead) {
    let applied = false;
    let retryNextFrame = false;
    try {
      const positions = await this.geometry.getPointPositionsAsync({
        dimensions: read.dimensions,
        signal: read.controller.signal,
      });
      if (!this.isCurrent(read)) return;
      if (this.syncDimensions()) {
        this.schedule();
        return;
      }
      if (positions.length !== read.data.pointsCount * read.dimensions)
        throw new Error("Label positions do not match the displayed graph");
      for (const id of this.ids) {
        if (read.kind === "moving" && this.chosen.has(id)) continue;
        const index = read.data.idToIndex.get(id);
        if (index !== undefined) this.positions.set(id, pointAt(positions, index, read.dimensions));
      }
      if (this.hasMovingLabels) {
        const completedAt = this.scheduler.now();
        const cooldown = Math.min(250, Math.max(50, (completedAt - read.startedAt) * 3));
        // Only future simulation samples wait; explicit reads and camera projection bypass it.
        this.nextMovingReadAt = completedAt + cooldown;
      }
      this.projectionDirty = true;
      this.abortRetries = 0;
      applied = true;
    } catch (failure) {
      if (!this.isCurrent(read)) return;
      // One frame retry also recovers paused layouts whose source upload is still pending.
      // Further aborts wait for new demand rather than creating an idle polling loop.
      // Operational failures wait for explicit demand instead of hammering the GPU.
      if (
        failure &&
        typeof failure === "object" &&
        "name" in failure &&
        failure.name === "AbortError"
      ) {
        if (this.abortRetries < 1) {
          this.abortRetries += 1;
          retryNextFrame = true;
        }
      } else {
        this.readFailed = true;
        if (!this.reportedFailure) {
          this.reportedFailure = true;
          this.reportError(failure);
        }
      }
    } finally {
      if (this.pending === read) {
        this.pending = undefined;
        const refreshQueued = this.readKind !== null;
        if (!applied) this.readKind = read.kind === "all" ? "all" : (this.readKind ?? "moving");
        if (applied || refreshQueued || retryNextFrame) this.schedule();
      }
    }
  }

  private draw() {
    for (const id of this.ids) {
      const index = this.data?.idToIndex.get(id);
      const label = this.labels.get(id);
      if (index === undefined || !label) continue;
      const position = this.positions.get(id);
      if (!position || !position.every(Number.isFinite)) {
        label.style.visibility = "hidden";
        continue;
      }
      const screen = projectPosition(this.geometry, position);
      if (!screen || !screen.every(Number.isFinite)) {
        label.style.visibility = "hidden";
        continue;
      }
      const radius = this.geometry.getPointScreenRadiusByIndex(
        index,
        position.length === 3 ? position : undefined,
      );
      label.style.left = `${screen[0]}px`;
      label.style.top = `${screen[1] - (Number.isFinite(radius) ? radius : 0) - 7}px`;
      label.style.visibility = "visible";
    }
  }

  private isCurrent(read: PositionRead) {
    return (
      !this.disposed &&
      this.active &&
      this.pending === read &&
      this.generation === read.generation &&
      this.data === read.data &&
      !read.controller.signal.aborted
    );
  }

  private isCurrentLabel(id: string, label: HTMLButtonElement) {
    return !this.disposed && this.active && this.labels.get(id) === label;
  }

  private syncDimensions() {
    const dimensions = this.geometry.is3D ? 3 : 2;
    if (dimensions === this.positionDimensions) return false;
    this.invalidate(true);
    this.positionDimensions = dimensions;
    return true;
  }

  private invalidate(clearPositions: boolean) {
    this.generation += 1;
    this.pending?.controller.abort();
    this.pending = undefined;
    if (this.frame !== undefined) this.scheduler.cancelFrame(this.frame);
    this.frame = undefined;
    this.readKind = "all";
    this.projectionDirty = true;
    this.readFailed = false;
    this.reportedFailure = false;
    this.abortRetries = 0;
    this.nextMovingReadAt = 0;
    if (clearPositions) {
      this.positions.clear();
      for (const label of this.labels.values()) label.style.visibility = "hidden";
    }
  }

  setActive(active: boolean) {
    if (this.disposed) return;
    if (this.active === active) {
      if (active) this.refresh("projection");
      return;
    }
    this.active = active;
    this.layer.hidden = !active;
    if (active) this.refresh();
    else this.invalidate(false);
  }

  dispose() {
    if (this.disposed) return;
    this.setActive(false);
    this.disposed = true;
    this.labels.clear();
    this.positions.clear();
    this.layer.remove();
    this.data = null;
  }
}
