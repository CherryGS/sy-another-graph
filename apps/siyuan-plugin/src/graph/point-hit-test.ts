import {
  cameraDepthOffset,
  pointAt,
  projectPosition,
  type CameraState,
  type PointGeometry,
} from "./geometry";

interface HitGeometry extends PointGeometry {
  findPointsInRect(rect: [[number, number], [number, number]]): number[] | undefined;
  getCameraState?(): CameraState | undefined;
}

/** Both the rectangle query and radius comparison use canvas-local CSS pixels. */
export function hitTestPoint(geometry: HitGeometry, screen: [number, number]): number | undefined {
  const dimensions = geometry.is3D ? 3 : 2;
  // The 2D GPU query takes CSS pixels and performs its own framebuffer Y flip.
  // Its 3D counterpart already reads and projects every point. Do that only once
  // here, also checking large perspective circles whose centers lie outside 36px.
  const candidates =
    dimensions === 2
      ? geometry.findPointsInRect([
          [screen[0] - 36, screen[1] - 36],
          [screen[0] + 36, screen[1] + 36],
        ])
      : undefined;
  if (dimensions === 2 && !candidates?.length) return;
  // getPointPositionByIndex reads the entire GPU position buffer for each candidate.
  const positions = geometry.getPointPositions({ dimensions });
  if (!positions) return;
  let closest: number | undefined;
  let distance = Infinity;
  let depth = -Infinity;
  const camera = geometry.is3D ? geometry.getCameraState?.() : undefined;
  const count = dimensions === 3 ? positions.length / 3 : candidates!.length;
  for (let candidate = 0; candidate < count; candidate++) {
    const index = dimensions === 3 ? candidate : candidates![candidate];
    const position = pointAt(positions, index, dimensions);
    if (!position.every(Number.isFinite)) continue;
    const point = projectPosition(geometry, position);
    if (!point) continue;
    const delta = Math.hypot(screen[0] - point[0], screen[1] - point[1]);
    const radius = geometry.getPointScreenRadiusByIndex(
      index,
      position.length === 3 ? position : undefined,
    );
    const candidateDepth = camera ? cameraDepthOffset(camera, position) : 0;
    if (
      delta <= Math.max(3, Number.isFinite(radius) ? radius : 0) + 2 &&
      (camera
        ? candidateDepth > depth || (candidateDepth === depth && delta < distance)
        : delta < distance)
    ) {
      closest = index;
      distance = delta;
      depth = candidateDepth;
    }
  }
  return closest;
}
