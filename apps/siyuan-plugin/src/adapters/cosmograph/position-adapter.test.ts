import { describe, expect, it, vi } from "vitest";
import {
  beginGroupMotion,
  beginCanvasGroupMotion,
  captureNodePositions,
  measurePositionRestore,
  positionApi,
  restoreNodePositions,
  type ViewportApi,
} from "./position-adapter";
import type { CameraState, Point2D, PointPosition } from "./geometry";

describe("chosen position movement", () => {
  it("quantifies the entire captured layouts, including removed IDs before and new IDs after", () => {
    const renderer = {
      getCanvas: () => null,
      getZoomLevel: () => 1,
      screenToSpacePosition: ((point: Point2D) => point) as ViewportApi["screenToSpacePosition"],
      spaceToScreenPosition: (point: PointPosition): Point2D => [point[0], point[1]],
      setZoomTransformByPointPositions: vi.fn(),
    };
    const before = new Map([
      ["a", [0, 0, 0]],
      ["b", [4096, 4096, 4096]],
      ["removed", [2048, 2048, 2048]],
    ]);
    const after = new Map([
      ["a", [0, 0, 0]],
      ["b", [4096, 4096, 4096]],
      ["new", [8192, -4096, 2048]],
    ]);
    const result = measurePositionRestore(renderer, before, after, []);
    expect(result.restored).toBe(2);
    expect(result.maximumWorldError).toBe(0);
    expect(result.layoutBefore).toEqual({
      count: 3,
      dimensions: 3,
      min: [0, 0, 0],
      max: [4096, 4096, 4096],
      minCount: [1, 1, 1],
      maxCount: [1, 1, 1],
      centroid: [2048, 2048, 2048],
    });
    expect(result.layoutAfter).toEqual({
      count: 3,
      dimensions: 3,
      min: [0, -4096, 0],
      max: [8192, 4096, 4096],
      minCount: [1, 1, 1],
      maxCount: [1, 1, 1],
      centroid: [4096, 0, 2048],
    });
    const repeated = new Map([
      ["a", [0, 10]],
      ["b", [0, 40]],
      ["c", [20, 40]],
      ["d", [40, 20]],
    ]);
    expect(measurePositionRestore(renderer, repeated, repeated, []).layoutAfter).toEqual({
      count: 4,
      dimensions: 2,
      min: [0, 10],
      max: [40, 40],
      minCount: [2, 1],
      maxCount: [1, 2],
      centroid: [15, 27.5],
    });
  });

  it("moves a 3D set in the grabbed node's depth plane while its shape and other points stay unchanged", () => {
    // Camera at +X looking toward the origin. Its screen axes are -Z and +Y.
    // Projection is independent of the implementation's orbit depth calculation.
    const camera: CameraState = {
      target: [0, 0, 0],
      distance: 100,
      azimuth: Math.PI / 2,
      polar: Math.PI / 2,
    };
    let positions: Float32Array = new Float32Array([10, 20, 30, 20, 30, 40, 50, 60, 70]);
    const project = (point: PointPosition): Point2D => [
      500 - ((point[2] ?? 0) * 100) / (100 - point[0]),
      300 - (point[1] * 100) / (100 - point[0]),
    ];
    const graph = {
      is3D: true,
      getCanvas: () => null,
      getZoomLevel: vi.fn(() => {
        throw new Error("2D zoom must not be read");
      }),
      setZoomTransformByPointPositions: vi.fn(),
      getCameraState: () => camera,
      spaceToScreenPosition: project,
      screenToSpacePosition: ((screen: Point2D) => [
        0,
        300 - screen[1],
        500 - screen[0],
      ]) as ViewportApi["screenToSpacePosition"],
      getPointPositions: vi.fn(() => positions),
      setPointPositions: vi.fn((next: Float32Array) => {
        positions = next;
      }),
      render: vi.fn(),
    };
    const origin = project([10, 20, 30]);
    const movement = beginCanvasGroupMotion(graph, [0, 1], 0, origin, 3);
    movement.move([origin[0] + 20, origin[1] + 30]);
    const movedRoot: PointPosition = [positions[0], positions[1], positions[2]];
    expect(project(movedRoot)[0] - origin[0]).toBeCloseTo(20, 4);
    expect(project(movedRoot)[1] - origin[1]).toBeCloseTo(30, 4);
    expect([...positions.slice(0, 6)]).toEqual([10, -7, 12, 20, 3, 22]);
    expect([...positions.slice(6)]).toEqual([50, 60, 70]);
    expect(graph.setPointPositions).toHaveBeenLastCalledWith(positions, {
      dimensions: 3,
      dontRescale: true,
    });
    expect(graph.getZoomLevel).not.toHaveBeenCalled();
  });

  it("preserves newly initialized depth when only XY coordinates existed before a 3D rebuild", () => {
    let positions: Float32Array = new Float32Array([100, 200, 8, 300, 400, 9]);
    const graph = {
      getPointPositions: () => positions,
      setPointPositions: (next: Float32Array) => {
        positions = next;
      },
      render: vi.fn(),
    };
    restoreNodePositions(
      graph,
      ["a", "b"],
      new Map([
        ["a", [10, 20]],
        ["b", [30, 40]],
      ]),
      3,
    );
    expect([...positions]).toEqual([10, 20, 8, 30, 40, 9]);
  });

  it("translates only the explicit roots by the same delta and preserves current nonmember positions", () => {
    let positions: Float32Array = new Float32Array([10, 20, 30, 40, 50, 60]);
    const initial = positions;
    const api = {
      getPointPositions: () => positions,
      setPointPositions: vi.fn((next: Float32Array) => {
        positions = next;
      }),
      render: vi.fn(),
    };
    const movement = beginGroupMotion({ _cosmos: api }, [0, 2, 2], [100, 100]);
    // The unchosen node is free to continue its own simulation while the roots are dragged.
    positions = new Float32Array([10, 20, 300, 400, 50, 60]);
    movement.move([103, 96]);
    expect([...positions]).toEqual([13, 16, 300, 400, 53, 56]);
    movement.move([109, 105]);
    expect([...positions]).toEqual([19, 25, 300, 400, 59, 65]);
    expect([...initial]).toEqual([10, 20, 30, 40, 50, 60]);
    expect(api.setPointPositions).toHaveBeenLastCalledWith(positions, {
      dimensions: 2,
      dontRescale: true,
    });
    expect(api.render).toHaveBeenLastCalledWith(undefined, 0);
  });

  it("prefers a forwarded public position API and reports an unavailable bridge", () => {
    const renderer = {
      getPointPositions: () => new Float32Array([1, 2]),
      setPointPositions: vi.fn(),
      render: vi.fn(),
      _cosmos: { unavailable: true },
    };
    expect(positionApi(renderer)).toBe(renderer);
    expect(() => positionApi({ _cosmos: {} })).toThrow("不支持");
  });

  it("does not write against changed topology or a missing chosen point", () => {
    let positions: Float32Array = new Float32Array([1, 2, 3, 4]);
    const api = {
      getPointPositions: () => positions,
      setPointPositions: vi.fn(),
      render: vi.fn(),
    };
    expect(() => beginGroupMotion(api, [2], [0, 0])).toThrow("位置已变化");
    const movement = beginGroupMotion(api, [0], [0, 0]);
    positions = new Float32Array([1, 2]);
    expect(() => movement.move([2, 2])).toThrow("图谱内容发生了变化");
    expect(api.setPointPositions).not.toHaveBeenCalled();
  });

  it("restores surviving IDs after reindexing without normalizing new point positions", () => {
    let positions: Float32Array = new Float32Array([10, 20, 30, 40]);
    const original = positions;
    const api = {
      getPointPositions: () => positions,
      setPointPositions: vi.fn((next: Float32Array) => {
        positions = next;
      }),
      render: vi.fn(),
    };
    const saved = captureNodePositions(api, ["a", "b"]);
    original[0] = 999;
    positions = new Float32Array([1, 2, 300, 400, 5, 6]);
    expect(restoreNodePositions(api, ["b", "new", "a"], saved)).toBe(2);
    expect([...positions]).toEqual([30, 40, 300, 400, 10, 20]);
    expect(api.setPointPositions).toHaveBeenCalledExactlyOnceWith(positions, {
      dimensions: 2,
      dontRescale: true,
    });
    expect(api.render).toHaveBeenCalledExactlyOnceWith(undefined, 0);
  });

  it("rejects mismatched coordinate snapshots instead of assigning another node's position", () => {
    const api = {
      getPointPositions: () => new Float32Array([1, 2]),
      setPointPositions: vi.fn(),
      render: vi.fn(),
    };
    expect(() => captureNodePositions(api, ["a", "b"])).toThrow("坐标与当前图谱不一致");
    expect(() => restoreNodePositions(api, ["a", "b"], new Map())).toThrow("更新后的节点坐标");
    expect(api.setPointPositions).not.toHaveBeenCalled();
  });
});
