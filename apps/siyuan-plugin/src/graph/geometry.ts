import type { Cosmograph } from "@cosmograph/cosmograph";

export type Dimensions = 2 | 3;
export type Point2D = [number, number];
export type Point3D = [number, number, number];
export type PointPosition = Point2D | Point3D;
export type CameraState = NonNullable<ReturnType<Cosmograph["getCameraState"]>>;

export type ProjectionApi = Pick<Cosmograph, "spaceToScreenPosition"> & {
  readonly is3D?: boolean;
};
export type PointGeometry = ProjectionApi &
  Pick<Cosmograph, "getPointPositions" | "getPointScreenRadiusByIndex">;
export type AsyncPointGeometry = ProjectionApi &
  Pick<Cosmograph, "getPointPositionsAsync" | "getPointScreenRadiusByIndex">;

export function pointAt(
  positions: Float32Array,
  index: number,
  dimensions: Dimensions,
): PointPosition {
  const offset = index * dimensions;
  return dimensions === 3
    ? [positions[offset], positions[offset + 1], positions[offset + 2]]
    : [positions[offset], positions[offset + 1]];
}

export function projectPosition(
  renderer: ProjectionApi,
  position: readonly number[],
): Point2D | undefined {
  if (renderer.is3D)
    return renderer.spaceToScreenPosition([position[0], position[1], position[2] ?? 0], {
      dimensions: 3,
    });
  return renderer.spaceToScreenPosition([position[0], position[1]]);
}

/** Distance along the orbit camera's outward axis; positive values are in front of its target. */
export function cameraDepthOffset(camera: CameraState, position: readonly number[]): number {
  const sinPolar = Math.sin(camera.polar);
  return (
    (position[0] - camera.target[0]) * sinPolar * Math.sin(camera.azimuth) +
    (position[1] - camera.target[1]) * Math.cos(camera.polar) +
    ((position[2] ?? 0) - camera.target[2]) * sinPolar * Math.cos(camera.azimuth)
  );
}
