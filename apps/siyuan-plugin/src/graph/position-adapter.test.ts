import { describe, expect, it, vi } from "vitest";
import {
  beginGroupMotion,
  captureNodePositions,
  positionApi,
  restoreNodePositions,
} from "./position-adapter";

describe("chosen position movement", () => {
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
      setPointPositions: vi.fn((next: Float32Array) => { positions = next; }),
      render: vi.fn(),
    };
    const saved = captureNodePositions(api, ["a", "b"]);
    original[0] = 999;
    positions = new Float32Array([1, 2, 300, 400, 5, 6]);
    expect(restoreNodePositions(api, ["b", "new", "a"], saved)).toBe(2);
    expect([...positions]).toEqual([30, 40, 300, 400, 10, 20]);
    expect(api.setPointPositions).toHaveBeenCalledExactlyOnceWith(positions, {
      dimensions: 2, dontRescale: true,
    });
    expect(api.render).toHaveBeenCalledExactlyOnceWith(undefined, 0);
  });

  it("rejects mismatched coordinate snapshots instead of assigning another node's position", () => {
    const api = {
      getPointPositions: () => new Float32Array([1, 2]),
      setPointPositions: vi.fn(), render: vi.fn(),
    };
    expect(() => captureNodePositions(api, ["a", "b"])).toThrow("坐标与当前图谱不一致");
    expect(() => restoreNodePositions(api, ["a", "b"], new Map())).toThrow("更新后的节点坐标");
    expect(api.setPointPositions).not.toHaveBeenCalled();
  });
});
