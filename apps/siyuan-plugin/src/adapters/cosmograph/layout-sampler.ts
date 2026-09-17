import type { Dimensions } from "./geometry";

export interface LayoutMetrics {
  count: number;
  dimensions: number | null;
  min: number[] | null;
  max: number[] | null;
  minCount: number[] | null;
  maxCount: number[] | null;
  centroid: number[] | null;
}

class LayoutAccumulator {
  private count = 0;
  private readonly dimensions: number;
  private readonly min: number[];
  private readonly max: number[];
  private readonly minCount: number[];
  private readonly maxCount: number[];
  private readonly total: number[];

  constructor(dimensions: number) {
    this.dimensions = dimensions;
    this.min = new Array(dimensions).fill(Infinity);
    this.max = new Array(dimensions).fill(-Infinity);
    this.minCount = new Array(dimensions).fill(0);
    this.maxCount = new Array(dimensions).fill(0);
    this.total = new Array(dimensions).fill(0);
  }

  addPoint(values: ArrayLike<number>, offset = 0) {
    for (let axis = 0; axis < this.dimensions; axis++)
      if (!Number.isFinite(values[offset + axis])) return;
    this.count++;
    for (let axis = 0; axis < this.dimensions; axis++) {
      const value = values[offset + axis];
      if (value < this.min[axis]) {
        this.min[axis] = value;
        this.minCount[axis] = 1;
      } else if (value === this.min[axis]) this.minCount[axis]++;
      if (value > this.max[axis]) {
        this.max[axis] = value;
        this.maxCount[axis] = 1;
      } else if (value === this.max[axis]) this.maxCount[axis]++;
      this.total[axis] += value;
    }
  }

  snapshot(): LayoutMetrics {
    return {
      count: this.count,
      dimensions: this.dimensions || null,
      min: this.count ? this.min : null,
      max: this.count ? this.max : null,
      minCount: this.count ? this.minCount : null,
      maxCount: this.count ? this.maxCount : null,
      centroid: this.count ? this.total.map((value) => value / this.count) : null,
    };
  }
}

/** One pass over an existing readback, with no per-point arrays or ID map. */
export function sampleLayoutBuffer(positions: Float32Array, dimensions: Dimensions): LayoutMetrics {
  const aggregate = new LayoutAccumulator(dimensions);
  for (let offset = 0; offset + dimensions <= positions.length; offset += dimensions)
    aggregate.addPoint(positions, offset);
  return aggregate.snapshot();
}
