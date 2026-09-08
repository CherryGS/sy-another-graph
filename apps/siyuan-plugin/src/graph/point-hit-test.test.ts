import { describe, expect, it, vi } from "vitest";
import { hitTestPoint } from "./point-hit-test";

describe("point hit testing", () => {
  it.each([0.25, 2.5])("queries screen coordinates after zoom %s and pan", (zoom) => {
    const world: [number, number] = [1040, 880];
    const screen: [number, number] = [320, 210];
    const geometry = {
      findPointsInRect: vi.fn((rect: [[number, number], [number, number]]) =>
        rect[0][0] <= screen[0] && rect[1][0] >= screen[0] &&
        rect[0][1] <= screen[1] && rect[1][1] >= screen[1] ? [0] : [],
      ),
      getPointPositions: vi.fn(() => new Float32Array(world)),
      spaceToScreenPosition: vi.fn((position: [number, number]): [number, number] => [
        (position[0] - world[0]) * zoom + screen[0],
        -(position[1] - world[1]) * zoom + screen[1],
      ]),
      getPointScreenRadiusByIndex: vi.fn(() => 6),
    };
    expect(hitTestPoint(geometry, screen)).toBe(0);
    expect(geometry.findPointsInRect).toHaveBeenCalledExactlyOnceWith([[284, 174], [356, 246]]);
  });

  it("checks the rendered radius and chooses the nearest point with one position readback", () => {
    const geometry = {
      findPointsInRect: vi.fn(() => [0, 1, 2, 3]),
      getPointPositions: vi.fn(() => new Float32Array([90, 100, 103, 100, 99, 100, NaN, NaN])),
      spaceToScreenPosition: (point: [number, number]) => point,
      getPointScreenRadiusByIndex: () => 4,
    };
    expect(hitTestPoint(geometry, [100, 100])).toBe(2);
    expect(geometry.getPointPositions).toHaveBeenCalledTimes(1);
    expect(hitTestPoint(geometry, [115, 100])).toBeUndefined();
  });

  it("does not read every point when the pointer is on blank canvas", () => {
    const geometry = {
      findPointsInRect: () => [],
      getPointPositions: vi.fn(),
      spaceToScreenPosition: vi.fn(),
      getPointScreenRadiusByIndex: vi.fn(),
    };
    expect(hitTestPoint(geometry, [50, 50])).toBeUndefined();
    expect(geometry.getPointPositions).not.toHaveBeenCalled();
  });
});
