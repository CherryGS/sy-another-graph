import { expect, it } from "vitest";
import { sampleLayoutBuffer } from "./layout-sampler";

it("aggregates a typed XY buffer directly and counts exact extreme populations", () => {
  const positions = new Float32Array([0, 10, 0, 40, 20, 40, 40, 20]);
  Object.defineProperty(positions, Symbol.iterator, { value: () => { throw new Error("The XY sampler must not materialize point arrays"); } });
  expect(sampleLayoutBuffer(positions, 2)).toEqual({ count: 4, dimensions: 2, min: [0, 10], max: [40, 40], minCount: [2, 1], maxCount: [1, 2], centroid: [15, 27.5] });
});

it("respects XYZ stride and excludes absent or invalid points from spatial statistics", () => {
  expect(sampleLayoutBuffer(new Float32Array([1, 2, 3, NaN, NaN, NaN, 5, 6, 7]), 3)).toEqual({ count: 2, dimensions: 3, min: [1, 2, 3], max: [5, 6, 7], minCount: [1, 1, 1], maxCount: [1, 1, 1], centroid: [3, 4, 5] });
  expect(sampleLayoutBuffer(new Float32Array(), 2)).toMatchObject({ count: 0, dimensions: 2, min: null, max: null, centroid: null });
});
