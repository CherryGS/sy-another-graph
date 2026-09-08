import type { PreparedGraph } from "./prepare-graph";
import type { CanvasNode } from "./types";
import { pointAt, projectPosition, type Dimensions, type PointGeometry, type PointPosition } from "./geometry";
interface LabelScheduler {
  frame(callback: () => void): number;
  cancelFrame(id: number): void;
}

/** App-owned labels have no count limit or collision culling. Source titles remain literal text. */
export class ChosenLabels {
  private readonly layer: HTMLDivElement;
  private readonly labels = new Map<string, HTMLButtonElement>();
  private data: PreparedGraph | null = null;
  private ids: readonly string[] = [];
  private frame?: number;
  private active = true;
  private disposed = false;
  private readonly geometry: PointGeometry;
  private readonly positions = new Map<string, PointPosition>();
  private positionsDirty = true;
  private hasMovingLabels = false;
  private positionDimensions: Dimensions = 2;
  private readonly onClick: (id: string, event: MouseEvent) => void;
  private readonly onHover: (node: CanvasNode | null) => void;
  private readonly scheduler: LabelScheduler;

  constructor(
    host: HTMLElement,
    geometry: PointGeometry,
    onClick: (id: string, event: MouseEvent) => void,
    onHover: (node: CanvasNode | null) => void,
    scheduler: LabelScheduler = {
      frame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (id) => window.cancelAnimationFrame(id),
    },
  ) {
    this.geometry = geometry;
    this.onClick = onClick;
    this.onHover = onHover;
    this.scheduler = scheduler;
    this.layer = host.ownerDocument.createElement("div");
    this.layer.className = "ag-canvas__chosen-labels";
    host.appendChild(this.layer);
  }

  update(
    data: PreparedGraph | null,
    ids: readonly string[],
    spotlightIds: readonly string[] = [],
  ) {
    if (this.disposed) return;
    this.data = data;
    const chosen = new Set(ids);
    this.ids = [...new Set([...ids, ...spotlightIds])].filter((id) =>
      data?.idToIndex.has(id),
    );
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
          if (this.active && this.data?.idToIndex.has(id))
            this.onClick(id, event);
        });
        const inspect = () => {
          const index = this.data?.idToIndex.get(id);
          if (this.active && index !== undefined)
            this.onHover(this.data?.indexToNode[index] ?? null);
        };
        label.addEventListener("mouseenter", inspect);
        label.addEventListener("focus", inspect);
        label.addEventListener("mouseleave", () => this.onHover(null));
        label.addEventListener("blur", () => this.onHover(null));
        this.labels.set(id, label);
        this.layer.appendChild(label);
      }
      const index = data!.idToIndex.get(id)!;
      label.className = chosen.has(id)
        ? "ag-canvas__chosen-label"
        : "ag-canvas__chosen-label ag-canvas__chosen-label--spotlight";
      if (data!.indexToNode[index].external) label.className += " ag-canvas__chosen-label--external";
      label.textContent = data!.indexToLabel[index];
      label.setAttribute(
        "aria-label",
        `${chosen.has(id) ? "已选" : "关系端点"}：${data!.indexToLabel[index]}`,
      );
    }
    this.refresh();
  }

  refresh(kind: "positions" | "projection" | "simulation" = "positions") {
    // Chosen points are pinned. Simulation frames cannot change their coordinates.
    // Only the explicitly temporary, unpinned endpoint labels need tick readbacks.
    if (kind === "simulation" && !this.hasMovingLabels) return;
    if (kind !== "projection") this.positionsDirty = true;
    if (
      this.disposed ||
      !this.active ||
      !this.ids.length ||
      this.frame !== undefined
    )
      return;
    this.frame = this.scheduler.frame(() => {
      this.frame = undefined;
      if (this.disposed || !this.active || !this.data) return;
      const dimensions = this.geometry.is3D ? 3 : 2;
      if (this.positionsDirty || dimensions !== this.positionDimensions) {
        const positions = this.geometry.getPointPositions({ dimensions });
        if (!positions) return;
        for (const id of this.ids) {
          const index = this.data.idToIndex.get(id);
          if (index !== undefined) this.positions.set(id, pointAt(positions, index, dimensions));
        }
        this.positionsDirty = false;
        this.positionDimensions = dimensions;
      }
      for (const id of this.ids) {
        const index = this.data.idToIndex.get(id);
        const label = this.labels.get(id);
        if (index === undefined || !label) continue;
        const position = this.positions.get(id);
        const screen = position && projectPosition(this.geometry, position);
        if (!screen || !screen.every(Number.isFinite)) {
          label.style.visibility = "hidden";
          continue;
        }
        const radius = this.geometry.getPointScreenRadiusByIndex(index, position?.length === 3 ? position : undefined);
        label.style.left = `${screen[0]}px`;
        label.style.top = `${screen[1] - (Number.isFinite(radius) ? radius : 0) - 7}px`;
        label.style.visibility = "visible";
      }
    });
  }

  setActive(active: boolean) {
    this.active = active;
    this.layer.hidden = !active;
    if (!active && this.frame !== undefined) {
      this.scheduler.cancelFrame(this.frame);
      this.frame = undefined;
    }
    if (active) this.refresh();
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
