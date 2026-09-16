import type { Cosmograph } from "@cosmograph/cosmograph";
import {
  cameraDepthOffset,
  pointAt,
  projectPosition,
  type CameraState,
  type Dimensions,
  type Point2D,
  type PointPosition,
  type ProjectionApi,
} from "./geometry";
import { sampleLayoutPoints, type LayoutMetrics } from "./layout-sampler";

/** The supported Cosmos position API is not yet forwarded by Cosmograph 2.5.1. */
interface PositionApi {
  getPointPositions(options?: { dimensions?: Dimensions }): Float32Array | undefined;
  setPointPositions(
    positions: Float32Array,
    options: { dimensions: Dimensions; dontRescale: true },
  ): void;
  render(alpha: undefined, transitionDuration: 0): void;
}

function hasPositionApi(candidate: unknown): candidate is PositionApi {
  if (!candidate || typeof candidate !== "object") return false;
  const api = candidate as Partial<PositionApi>;
  return (
    typeof api.getPointPositions === "function" &&
    typeof api.setPointPositions === "function" &&
    typeof api.render === "function"
  );
}

/** Keep the sole version-specific bridge here; never touch GPU/store internals. */
export function positionApi(renderer: unknown): PositionApi {
  if (hasPositionApi(renderer)) return renderer;
  const engine = (renderer as { _cosmos?: unknown } | null)?._cosmos;
  if (hasPositionApi(engine)) return engine;
  throw new Error("当前渲染器不支持节点位置更新，请重新加载图谱。");
}

export type NodePositions = ReadonlyMap<string, readonly number[]>;
/** All camera and projection operations are public Cosmograph APIs. */
export interface ViewportApi extends ProjectionApi {
  getCanvas(): HTMLCanvasElement | null;
  getZoomLevel(): number | undefined;
  screenToSpacePosition: Cosmograph["screenToSpacePosition"];
  getCameraState?: Cosmograph["getCameraState"];
  setCameraState?: Cosmograph["setCameraState"];
  setZoomTransformByPointPositions(
    positions: Float32Array,
    duration?: number,
    scale?: number,
    padding?: number,
  ): void;
}

export type ViewportSnapshot =
  | {
      dimensions: 2;
      zoom: number;
      center: [number, number];
    }
  | { dimensions: 3; camera: CameraState };

export interface PositionProbe {
  id: string;
  world: number[];
  screen: [number, number] | null;
}

export interface PositionRestore {
  restored: number;
  maximumWorldError: number | null;
  maximumScreenError: number | null;
  layoutBefore: LayoutMetrics;
  layoutAfter: LayoutMetrics;
  samples: {
    id: string;
    worldBefore: number[];
    worldAfter: number[];
    screenBefore: [number, number] | null;
    screenAfter: [number, number] | null;
  }[];
}

/** Capture only IDs in the graph that is actually backed by the current GPU tables. */
export function captureNodePositions(
  renderer: unknown,
  ids: readonly string[],
  dimensions: Dimensions = 2,
): NodePositions {
  const values = positionApi(renderer).getPointPositions({ dimensions });
  if (!values || values.length !== ids.length * dimensions)
    throw new Error("节点坐标与当前图谱不一致，无法安全保留布局。");
  const positions = new Map<string, PointPosition>();
  ids.forEach((id, index) => {
    const point = pointAt(values, index, dimensions);
    if (point.every(Number.isFinite)) positions.set(id, point);
  });
  return positions;
}

/** Reindex existing coordinates by stable ID, leaving new points at their new initial positions. */
export function restoreNodePositions(
  renderer: unknown,
  ids: readonly string[],
  saved: NodePositions,
  dimensions: Dimensions = 2,
) {
  const api = positionApi(renderer);
  const current = api.getPointPositions({ dimensions });
  if (!current || current.length !== ids.length * dimensions)
    throw new Error("更新后的节点坐标与图谱不一致，无法安全恢复布局。");
  const next = new Float32Array(current);
  let restored = 0;
  let changed = false;
  ids.forEach((id, index) => {
    const position = saved.get(id);
    if (!position) return;
    restored++;
    // A first 2D→3D conversion retains the newly initialized Z values.
    for (let axis = 0; axis < Math.min(dimensions, position.length); axis++) {
      changed ||= next[index * dimensions + axis] !== position[axis];
      next[index * dimensions + axis] = position[axis];
    }
  });
  if (changed) {
    api.setPointPositions(next, { dimensions, dontRescale: true });
    api.render(undefined, 0);
  }
  return restored;
}

/** A 2D camera can be represented through its public zoom and world-space viewport center. */
export function captureViewport(renderer: ViewportApi): ViewportSnapshot | null {
  if (renderer.is3D) {
    const camera = renderer.getCameraState?.();
    if (
      !camera ||
      ![...camera.target, camera.distance, camera.azimuth, camera.polar].every(Number.isFinite) ||
      camera.distance <= 0
    )
      return null;
    return { dimensions: 3, camera: { ...camera, target: [...camera.target] } };
  }
  const bounds = renderer.getCanvas()?.getBoundingClientRect();
  const zoom = renderer.getZoomLevel();
  if (
    !bounds ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    !Number.isFinite(zoom) ||
    !zoom ||
    zoom <= 0
  )
    return null;
  const center = renderer.screenToSpacePosition([bounds.width / 2, bounds.height / 2]);
  if (!center || !center.every(Number.isFinite)) return null;
  return { dimensions: 2, zoom, center: [...center] };
}

export function restoreViewport(renderer: ViewportApi, saved: ViewportSnapshot) {
  // A requested mode change uses Cosmos's native framing handoff.
  if (Boolean(renderer.is3D) !== (saved.dimensions === 3)) return;
  if (saved.dimensions === 3) {
    renderer.setCameraState?.(saved.camera, 0);
    return;
  }
  // Supplying an explicit scale makes this a center/zoom restoration, not an automatic fit.
  renderer.setZoomTransformByPointPositions(new Float32Array(saved.center), 0, saved.zoom, 0);
}

/** Small public-coordinate probes distinguish a camera reset from movement of the actual points. */
export function positionProbes(
  renderer: ViewportApi,
  positions: NodePositions,
  ids: readonly string[],
): PositionProbe[] {
  const probes: PositionProbe[] = [];
  for (const id of new Set(ids)) {
    const position = positions.get(id);
    if (!position) continue;
    const world = [...position];
    const screen = projectPosition(renderer, world);
    probes.push({ id, world, screen: screen?.every(Number.isFinite) ? [...screen] : null });
    if (probes.length === 8) break;
  }
  return probes;
}

export function measurePositionRestore(
  renderer: ViewportApi,
  before: NodePositions,
  after: NodePositions,
  probes: readonly PositionProbe[],
): PositionRestore {
  let restored = 0;
  let maximumWorldError: number | null = null;
  for (const [id, position] of after) {
    const original = before.get(id);
    if (!original) continue;
    restored++;
    const error = Math.hypot(...original.map((value, axis) => position[axis] - value));
    maximumWorldError = Math.max(maximumWorldError ?? 0, error);
  }
  let maximumScreenError: number | null = null;
  const samples: PositionRestore["samples"] = [];
  for (const probe of probes) {
    const position = after.get(probe.id);
    if (!position) continue;
    const world = [...position];
    const projected = projectPosition(renderer, world);
    const screen: [number, number] | null = projected?.every(Number.isFinite)
      ? [...projected]
      : null;
    if (probe.screen && screen)
      maximumScreenError = Math.max(
        maximumScreenError ?? 0,
        Math.hypot(screen[0] - probe.screen[0], screen[1] - probe.screen[1]),
      );
    samples.push({
      id: probe.id,
      worldBefore: probe.world,
      worldAfter: world,
      screenBefore: probe.screen,
      screenAfter: screen,
    });
  }
  return {
    restored,
    maximumWorldError,
    maximumScreenError,
    samples,
    layoutBefore: sampleLayoutPoints(before.values()),
    layoutAfter: sampleLayoutPoints(after.values()),
  };
}

export interface GroupMotion {
  move(position: readonly number[]): void;
}

/** Snapshot only the explicit roots; every move preserves all other current positions. */
export function beginGroupMotion(
  renderer: unknown,
  indices: readonly number[],
  origin: readonly number[],
  dimensions: Dimensions = 2,
  depthScale = 1,
): GroupMotion {
  const api = positionApi(renderer);
  const initial = api.getPointPositions({ dimensions });
  if (!initial || initial.length % dimensions !== 0)
    throw new Error("暂时无法读取节点位置，请等待图谱完成布局后重试。");
  const roots = [...new Set(indices)].map((index) => {
    const point = pointAt(initial, index, dimensions);
    if (!Number.isSafeInteger(index) || index < 0 || !point.every(Number.isFinite))
      throw new Error("选中节点的位置已变化，请重新开始拖动。");
    return { index, point };
  });
  return {
    move(position) {
      const delta = Array.from(
        { length: dimensions },
        (_, axis) => ((position[axis] ?? 0) - (origin[axis] ?? 0)) * depthScale,
      );
      if (!delta.every(Number.isFinite)) return;
      const current = api.getPointPositions({ dimensions });
      if (!current || current.length !== initial.length)
        throw new Error("拖动期间图谱内容发生了变化，请重新开始拖动。");
      // Readback is owned by the renderer. Do not mutate a borrowed buffer.
      const next = new Float32Array(current);
      for (const { index, point } of roots)
        for (let axis = 0; axis < dimensions; axis++)
          next[index * dimensions + axis] = point[axis] + delta[axis];
      api.setPointPositions(next, { dimensions, dontRescale: true });
      // Snap the coordinates without reheating or resuming a paused simulation.
      api.render(undefined, 0);
    },
  };
}

/** Translate on the camera-facing plane through the grabbed root, preserving the set's 3D shape. */
export function beginCanvasGroupMotion(
  renderer: ViewportApi,
  indices: readonly number[],
  grabbedIndex: number,
  originScreen: Point2D,
  dimensions: Dimensions,
): GroupMotion {
  const is3D = Boolean(renderer.is3D);
  const unproject = (screen: Point2D) =>
    is3D
      ? renderer.screenToSpacePosition(screen, { dimensions: 3 })
      : renderer.screenToSpacePosition(screen);
  const origin = unproject(originScreen);
  if (!origin?.every(Number.isFinite)) throw new Error("暂时无法确定拖动平面，请重试。");
  let depthScale = 1;
  if (is3D) {
    const camera = renderer.getCameraState?.();
    const positions = positionApi(renderer).getPointPositions({ dimensions: 3 });
    const grabbed = positions && pointAt(positions, grabbedIndex, 3);
    if (!camera || !grabbed?.every(Number.isFinite))
      throw new Error("暂时无法确定三维拖动平面，请重试。");
    // Public unprojection uses the target-depth plane. Perspective scales its
    // displacement by grabbed-depth / target-depth to reach the root's plane.
    depthScale = 1 - cameraDepthOffset(camera, grabbed) / camera.distance;
    if (!Number.isFinite(depthScale) || depthScale <= 0)
      throw new Error("节点不在相机前方，请重新开始拖动。");
  }
  const motion = beginGroupMotion(renderer, indices, origin, dimensions, depthScale);
  return {
    move(screen) {
      if (Boolean(renderer.is3D) !== is3D) throw new Error("视图维度已变化，请重新开始拖动。");
      const point = unproject([screen[0], screen[1]]);
      if (point?.every(Number.isFinite)) motion.move(point);
    },
  };
}
