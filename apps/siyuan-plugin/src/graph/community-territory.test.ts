import { describe, expect, it } from "vitest";
import { relativeTransform, territoryRaster, type Affine2D } from "./community-territory";

const identity: Affine2D = [1, 0, 0, 1, 0, 0];
describe("community territory geometry", () => {
  it("leaves distant empty space and singleton points unpainted", () => {
    const raster = territoryRaster(
      new Float32Array([30, 30, 36, 30, 540, 30]),
      new Uint32Array([0, 0, 2]),
      new Uint32Array([2, 0, 1]),
      new Map([[0, [100, 200, 50]]]),
      identity,
      600,
      120,
    );
    const alpha = (x: number, y: number) => raster.pixels[(y * raster.width + x) * 4 + 3];
    expect(alpha(5, 5)).toBeGreaterThan(0);
    expect(alpha(50, 5)).toBe(0);
    expect(alpha(90, 5)).toBe(0);
  });

  it("keeps close communities distinct and bounds the raster on large displays", () => {
    const raster = territoryRaster(
      new Float32Array([30, 30, 36, 30, 60, 30, 66, 30]),
      new Uint32Array([0, 0, 2, 2]),
      new Uint32Array([2, 0, 2, 0]),
      new Map([
        [0, [255, 0, 0]],
        [2, [0, 255, 0]],
      ]),
      identity,
      120,
      120,
    );
    expect([
      ...raster.pixels.slice((5 * raster.width + 5) * 4, (5 * raster.width + 5) * 4 + 3),
    ]).toEqual([255, 0, 0]);
    expect([
      ...raster.pixels.slice((5 * raster.width + 10) * 4, (5 * raster.width + 10) * 4 + 3),
    ]).toEqual([0, 255, 0]);
    const large = territoryRaster(
      new Float32Array(),
      new Uint32Array(),
      new Uint32Array(),
      new Map(),
      identity,
      7680,
      4320,
    );
    expect(large.width).toBeLessThanOrEqual(384);
    expect(large.height).toBeLessThanOrEqual(384);
  });

  it("reprojects cached camera geometry exactly, including an inverted Y axis", () => {
    const from: Affine2D = [2, 0, 0, -2, 50, 100];
    const to: Affine2D = [4, 0, 0, -4, 20, 30];
    const [a, b, c, d, x, y] = relativeTransform(from, to);
    const old = [56, 90]; // world point (3, 5)
    expect([a * old[0] + c * old[1] + x, b * old[0] + d * old[1] + y]).toEqual([32, 10]);
  });
});
