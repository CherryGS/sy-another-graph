interface PointGeometry {
  findPointsInRect(rect: [[number, number], [number, number]]): number[] | undefined;
  getPointPositions(): Float32Array | undefined;
  spaceToScreenPosition(position: [number, number]): [number, number] | undefined;
  getPointScreenRadiusByIndex(index: number): number;
}

/** Both the rectangle query and radius comparison use canvas-local CSS pixels. */
export function hitTestPoint(
  geometry: PointGeometry,
  screen: [number, number],
): number | undefined {
  // Cosmos expects screen coordinates here, and performs its own framebuffer Y flip.
  const candidates = geometry.findPointsInRect([
    [screen[0] - 36, screen[1] - 36],
    [screen[0] + 36, screen[1] + 36],
  ]);
  if (!candidates?.length) return;
  // getPointPositionByIndex reads the entire GPU position buffer for each candidate.
  const positions = geometry.getPointPositions();
  if (!positions) return;
  let closest: number | undefined;
  let distance = Infinity;
  for (const index of candidates) {
    const position: [number, number] = [positions[index * 2], positions[index * 2 + 1]];
    if (!position.every(Number.isFinite)) continue;
    const point = geometry.spaceToScreenPosition(position);
    if (!point) continue;
    const delta = Math.hypot(screen[0] - point[0], screen[1] - point[1]);
    const radius = geometry.getPointScreenRadiusByIndex(index);
    if (delta <= Math.max(3, Number.isFinite(radius) ? radius : 0) + 2 && delta < distance) {
      closest = index;
      distance = delta;
    }
  }
  return closest;
}
