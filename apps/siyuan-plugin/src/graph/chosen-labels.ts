import type { PreparedGraph } from "./prepare-graph";
import type { CanvasNode } from "./types";

interface Geometry {
  getPointPositions(): Float32Array | undefined;
  spaceToScreenPosition(
    position: [number, number],
  ): [number, number] | undefined;
  getPointScreenRadiusByIndex(index: number): number;
}
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
  private readonly geometry: Geometry;
  private readonly onClick: (id: string, event: MouseEvent) => void;
  private readonly onHover: (node: CanvasNode | null) => void;
  private readonly scheduler: LabelScheduler;

  constructor(
    host: HTMLElement,
    geometry: Geometry,
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
    const retained = new Set(this.ids);
    for (const [id, label] of this.labels) {
      if (!retained.has(id)) {
        label.remove();
        this.labels.delete(id);
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
      label.textContent = data!.indexToLabel[index];
      label.setAttribute(
        "aria-label",
        `${chosen.has(id) ? "已选" : "关系端点"}：${data!.indexToLabel[index]}`,
      );
    }
    this.refresh();
  }

  refresh() {
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
      const positions = this.geometry.getPointPositions();
      if (!positions) return;
      for (const id of this.ids) {
        const index = this.data.idToIndex.get(id);
        const label = this.labels.get(id);
        if (index === undefined || !label) continue;
        const position: [number, number] = [
          positions[index * 2],
          positions[index * 2 + 1],
        ];
        const screen = this.geometry.spaceToScreenPosition(position);
        if (!screen || !screen.every(Number.isFinite)) {
          label.style.visibility = "hidden";
          continue;
        }
        const radius = this.geometry.getPointScreenRadiusByIndex(index);
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
    this.layer.remove();
    this.data = null;
  }
}
