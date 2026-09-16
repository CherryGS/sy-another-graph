import { message as msg, MessageError } from "../../core/diagnostics/message";
import type { AsyncPointGeometry } from "./geometry";
import type { PreparedGraph } from "./prepare-graph";
import type { CommunityPartition } from "../../modules/communities/community-client";
import {
  communityColor,
  relativeTransform,
  territoryRaster,
  type Affine2D,
} from "./community-territory";

interface Capture {
  controller: AbortController;
  generation: number;
  started: number;
}

/** Decorative 2D layer. Async captures share the renderer's PBO readback;
 * bounded low-resolution geometry updates are independent of mouse hit testing. */
export class CommunityBackground {
  private readonly canvas: HTMLCanvasElement;
  private readonly geometry: AsyncPointGeometry;
  private readonly context: CanvasRenderingContext2D;
  private readonly raster: HTMLCanvasElement;
  private readonly rasterContext: CanvasRenderingContext2D;
  private data: PreparedGraph | null = null;
  private partition?: CommunityPartition;
  private colors = new Map<number, readonly number[]>();
  private positions: Float32Array | null = null;
  private basis: Affine2D | null = null;
  private imageWidth = 0;
  private imageHeight = 0;
  private enabled = false;
  private active = false;
  private disposed = false;
  private generation = 0;
  private pending?: Capture;
  private frame?: number;
  private timer?: number;
  private readWanted = false;
  private rasterDirty = false;
  private nextReadAt = 0;
  private nextRasterAt = 0;
  private failed = false;
  private abortRetries = 0;
  private readCount = 0;
  private rasterCount = 0;

  constructor(canvas: HTMLCanvasElement, geometry: AsyncPointGeometry) {
    this.canvas = canvas;
    this.geometry = geometry;
    const context = canvas.getContext("2d");
    const raster = canvas.ownerDocument.createElement("canvas");
    const rasterContext = raster.getContext("2d");
    if (!context || !rasterContext)
      throw new MessageError(msg("text.cannotCreateTheCommunityBackgroundCanvas"));
    this.context = context;
    this.raster = raster;
    this.rasterContext = rasterContext;
    this.canvas.hidden = true;
  }

  update(data: PreparedGraph | null, partition: CommunityPartition | undefined, enabled: boolean) {
    if (this.disposed) return;
    if (this.data !== data || this.partition !== partition || this.enabled !== enabled) {
      this.invalidate(true);
      this.data = data;
      this.partition = partition;
      this.enabled = enabled;
      this.colors.clear();
      if (partition && data)
        for (let i = 0; i < partition.sizes.length; i++) {
          if (partition.sizes[i] > 1) this.colors.set(i, communityColor(data.indexToId[i]));
        }
    }
    this.refresh("projection");
  }

  setActive(active: boolean) {
    if (this.disposed) return;
    if (this.active !== active) {
      this.invalidate(false);
      this.active = active;
    }
    this.refresh("projection");
  }

  refresh(kind: "projection" | "simulation" | "positions" = "positions") {
    if (this.disposed) return;
    if (!this.usable()) {
      this.canvas.hidden = true;
      return;
    }
    if (this.failed && kind !== "positions") {
      this.canvas.hidden = true;
      return;
    }
    this.canvas.hidden = false;
    if (kind !== "projection") this.readWanted = true;
    if (kind === "positions") {
      this.failed = false;
      this.nextReadAt = 0;
    }
    if (kind === "projection") this.rasterDirty = true;
    this.schedule();
  }

  /** A pre-stop capture cannot be the last image of a paused/finished layout. */
  settle() {
    if (!this.usable()) return;
    this.invalidate(false);
    this.refresh("positions");
  }

  private usable() {
    return (
      !this.disposed &&
      this.active &&
      this.enabled &&
      !!this.partition?.count &&
      !!this.data?.pointsCount &&
      !this.geometry.is3D
    );
  }

  private schedule() {
    if (!this.usable() || this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      if (!this.usable()) return;
      const now = performance.now();
      if (this.readWanted && !this.pending && !this.failed && now >= this.nextReadAt) {
        const capture = {
          controller: new AbortController(),
          generation: this.generation,
          started: now,
        };
        this.pending = capture;
        this.readWanted = false;
        void this.capture(capture);
      }
      if (this.positions && this.rasterDirty && now >= this.nextRasterAt) this.rebuild();
      this.draw();
      const wake = Math.min(
        this.readWanted && !this.pending && !this.failed ? this.nextReadAt : Infinity,
        this.positions && this.rasterDirty ? this.nextRasterAt : Infinity,
      );
      if (Number.isFinite(wake) && this.timer === undefined) {
        this.timer = window.setTimeout(
          () => {
            this.timer = undefined;
            this.schedule();
          },
          Math.max(16, wake - performance.now()),
        );
      }
    });
  }

  private async capture(capture: Capture) {
    try {
      const positions = await this.geometry.getPointPositionsAsync({
        dimensions: 2,
        signal: capture.controller.signal,
      });
      if (this.pending !== capture || capture.generation !== this.generation || !this.usable())
        return;
      if (positions.length !== this.data!.pointsCount * 2)
        throw new MessageError(msg("text.communityCoordinatesDoNotMatchTheCurrentGraph"));
      this.positions = positions;
      this.readCount++;
      this.canvas.dataset.positionReads = String(this.readCount);
      this.rasterDirty = true;
      this.abortRetries = 0;
      this.nextReadAt =
        performance.now() +
        Math.min(1000, Math.max(250, (performance.now() - capture.started) * 4));
    } catch (error) {
      if (this.pending !== capture || capture.generation !== this.generation) return;
      if (error instanceof Error && error.name === "AbortError" && this.abortRetries++ === 0) {
        this.readWanted = true;
        this.nextReadAt = performance.now() + 100;
      } else {
        this.failed = true;
        this.canvas.hidden = true;
        console.warn("Community background could not refresh", error);
      }
    } finally {
      if (this.pending === capture) {
        this.pending = undefined;
        if (!this.failed) this.schedule();
      }
    }
  }

  private transform(): Affine2D | null {
    const p = this.geometry.spaceToScreenPosition([0, 0]);
    const x = this.geometry.spaceToScreenPosition([1, 0]);
    const y = this.geometry.spaceToScreenPosition([0, 1]);
    if (!p || !x || !y) return null;
    const result: Affine2D = [x[0] - p[0], x[1] - p[1], y[0] - p[0], y[1] - p[1], p[0], p[1]];
    return result.every(Number.isFinite) &&
      Math.abs(result[0] * result[3] - result[1] * result[2]) > 1e-12
      ? result
      : null;
  }

  private rebuild() {
    const basis = this.transform();
    const width = this.canvas.clientWidth,
      height = this.canvas.clientHeight;
    if (!basis || !width || !height || !this.positions || !this.partition) return;
    const start = performance.now();
    const raster = territoryRaster(
      this.positions,
      this.partition.membership,
      this.partition.sizes,
      this.colors,
      basis,
      width,
      height,
    );
    this.raster.width = raster.width;
    this.raster.height = raster.height;
    const image = this.rasterContext.createImageData(raster.width, raster.height);
    image.data.set(raster.pixels);
    this.rasterContext.putImageData(image, 0, 0);
    this.basis = basis;
    this.imageWidth = width;
    this.imageHeight = height;
    this.rasterDirty = false;
    this.nextRasterAt = performance.now() + 200;
    this.canvas.dataset.rasterUpdates = String(++this.rasterCount);
    this.canvas.dataset.occupiedCells = String(raster.occupiedCells);
    this.canvas.dataset.rasterMs = (performance.now() - start).toFixed(2);
  }

  private draw() {
    if (!this.basis || !this.usable() || this.failed) return;
    const basis = this.transform();
    if (!basis) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(this.canvas.clientWidth * ratio),
      height = Math.round(this.canvas.clientHeight * ratio);
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.context.resetTransform();
    this.context.clearRect(0, 0, width, height);
    const transform = relativeTransform(this.basis, basis);
    this.context.setTransform(
      transform[0] * ratio,
      transform[1] * ratio,
      transform[2] * ratio,
      transform[3] * ratio,
      transform[4] * ratio,
      transform[5] * ratio,
    );
    this.context.imageSmoothingEnabled = true;
    this.context.drawImage(this.raster, 0, 0, this.imageWidth, this.imageHeight);
  }

  private invalidate(clear: boolean) {
    this.generation++;
    this.pending?.controller.abort();
    this.pending = undefined;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.frame = undefined;
    this.timer = undefined;
    this.readWanted = true;
    this.rasterDirty = true;
    this.nextReadAt = 0;
    this.nextRasterAt = 0;
    this.failed = false;
    this.abortRetries = 0;
    this.canvas.hidden = true;
    if (clear) {
      this.positions = null;
      this.basis = null;
    }
  }

  dispose() {
    this.invalidate(true);
    this.disposed = true;
    this.data = null;
    this.partition = undefined;
    this.colors.clear();
    this.canvas.width = this.canvas.height = this.raster.width = this.raster.height = 0;
  }
}
