/** The supported Cosmos position API is not yet forwarded by Cosmograph 2.5.1. */
interface PositionApi {
  getPointPositions(): Float32Array | undefined;
  setPointPositions(
    positions: Float32Array,
    options: { dimensions: 2; dontRescale: true },
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

export type NodePositions = ReadonlyMap<string, readonly [number, number]>;
/** The workbench uses the renderer's public 2D geometry operations. */
export interface ViewportApi {
  getCanvas(): HTMLCanvasElement | null;
  getZoomLevel(): number | undefined;
  screenToSpacePosition(position: [number, number]): [number, number] | undefined;
  spaceToScreenPosition(position: [number, number]): [number, number] | undefined;
  setZoomTransformByPointPositions(positions: Float32Array, duration?: number, scale?: number, padding?: number): void;
}

export interface ViewportSnapshot {
  zoom: number;
  center: [number, number];
}

export interface PositionProbe {
  id: string;
  world: [number, number];
  screen: [number, number] | null;
}

export interface PositionRestore {
  restored: number;
  maximumWorldError: number | null;
  maximumScreenError: number | null;
  samples: {
    id: string;
    worldBefore: [number, number];
    worldAfter: [number, number];
    screenBefore: [number, number] | null;
    screenAfter: [number, number] | null;
  }[];
}

/** Capture only IDs in the graph that is actually backed by the current GPU tables. */
export function captureNodePositions(renderer: unknown, ids: readonly string[]): NodePositions {
  const values = positionApi(renderer).getPointPositions();
  if (!values || values.length !== ids.length * 2)
    throw new Error("节点坐标与当前图谱不一致，无法安全保留布局。");
  const positions = new Map<string, [number, number]>();
  ids.forEach((id, index) => {
    const x = values[index * 2];
    const y = values[index * 2 + 1];
    if (Number.isFinite(x) && Number.isFinite(y)) positions.set(id, [x, y]);
  });
  return positions;
}

/** Reindex existing coordinates by stable ID, leaving new points at their new initial positions. */
export function restoreNodePositions(renderer: unknown, ids: readonly string[], saved: NodePositions) {
  const api = positionApi(renderer);
  const current = api.getPointPositions();
  if (!current || current.length !== ids.length * 2)
    throw new Error("更新后的节点坐标与图谱不一致，无法安全恢复布局。");
  const next = new Float32Array(current);
  let restored = 0;
  let changed = false;
  ids.forEach((id, index) => {
    const position = saved.get(id);
    if (!position) return;
    restored++;
    changed ||= next[index * 2] !== position[0] || next[index * 2 + 1] !== position[1];
    next[index * 2] = position[0];
    next[index * 2 + 1] = position[1];
  });
  if (changed) {
    api.setPointPositions(next, { dimensions: 2, dontRescale: true });
    api.render(undefined, 0);
  }
  return restored;
}

/** A 2D camera can be represented through its public zoom and world-space viewport center. */
export function captureViewport(renderer: ViewportApi): ViewportSnapshot | null {
  const bounds = renderer.getCanvas()?.getBoundingClientRect();
  const zoom = renderer.getZoomLevel();
  if (!bounds || bounds.width <= 0 || bounds.height <= 0 || !Number.isFinite(zoom) || !zoom || zoom <= 0)
    return null;
  const center = renderer.screenToSpacePosition([bounds.width / 2, bounds.height / 2]);
  if (!center || !center.every(Number.isFinite)) return null;
  return { zoom, center: [...center] };
}

export function restoreViewport(renderer: ViewportApi, saved: ViewportSnapshot) {
  // Supplying an explicit scale makes this a center/zoom restoration, not an automatic fit.
  renderer.setZoomTransformByPointPositions(new Float32Array(saved.center), 0, saved.zoom, 0);
}

/** Small public-coordinate probes distinguish a camera reset from movement of the actual points. */
export function positionProbes(renderer: ViewportApi, positions: NodePositions, ids: readonly string[]): PositionProbe[] {
  const probes: PositionProbe[] = [];
  for (const id of new Set(ids)) {
    const position = positions.get(id);
    if (!position) continue;
    const world: [number, number] = [...position];
    const screen = renderer.spaceToScreenPosition(world);
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
    const error = Math.hypot(position[0] - original[0], position[1] - original[1]);
    maximumWorldError = Math.max(maximumWorldError ?? 0, error);
  }
  let maximumScreenError: number | null = null;
  const samples: PositionRestore["samples"] = [];
  for (const probe of probes) {
    const position = after.get(probe.id);
    if (!position) continue;
    const world: [number, number] = [...position];
    const projected = renderer.spaceToScreenPosition(world);
    const screen: [number, number] | null = projected?.every(Number.isFinite) ? [...projected] : null;
    if (probe.screen && screen)
      maximumScreenError = Math.max(maximumScreenError ?? 0, Math.hypot(screen[0] - probe.screen[0], screen[1] - probe.screen[1]));
    samples.push({
      id: probe.id, worldBefore: probe.world, worldAfter: world,
      screenBefore: probe.screen, screenAfter: screen,
    });
  }
  return { restored, maximumWorldError, maximumScreenError, samples };
}

export interface GroupMotion {
  move(position: readonly [number, number]): void;
}

/** Snapshot only the explicit roots; every move preserves all other current positions. */
export function beginGroupMotion(
  renderer: unknown,
  indices: readonly number[],
  origin: readonly [number, number],
): GroupMotion {
  const api = positionApi(renderer);
  const initial = api.getPointPositions();
  if (!initial || initial.length % 2 !== 0)
    throw new Error("暂时无法读取节点位置，请等待图谱完成布局后重试。");
  const roots = [...new Set(indices)].map((index) => {
    const x = initial[index * 2];
    const y = initial[index * 2 + 1];
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      throw new Error("选中节点的位置已变化，请重新开始拖动。");
    return { index, x, y };
  });
  return {
    move(position) {
      const dx = position[0] - origin[0];
      const dy = position[1] - origin[1];
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      const current = api.getPointPositions();
      if (!current || current.length !== initial.length)
        throw new Error("拖动期间图谱内容发生了变化，请重新开始拖动。");
      // Readback is owned by the renderer. Do not mutate a borrowed buffer.
      const next = new Float32Array(current);
      for (const { index, x, y } of roots) {
        next[index * 2] = x + dx;
        next[index * 2 + 1] = y + dy;
      }
      api.setPointPositions(next, { dimensions: 2, dontRescale: true });
      // Snap the coordinates without reheating or resuming a paused simulation.
      api.render(undefined, 0);
    },
  };
}
