import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cosmograph } from "@cosmograph/cosmograph";
import { CosmographConfigManager } from "@cosmograph/cosmograph/cosmograph/config/index.js";
import { fillMissingPointPositions, getRandomPointPositions } from "@cosmograph/cosmograph/cosmograph/graph-utils/points.js";

const projectRequire = createRequire(import.meta.url);
const cosmographRequire = createRequire(projectRequire.resolve("@cosmograph/cosmograph"));
const { Graph } = await import(pathToFileURL(cosmographRequire.resolve("@cosmograph/cosmos")).href);
const seed = 731;

function cpuGraph(deviceLimit?: number, dimensions: 2 | 3 = 2) {
  // The actual constructor creates its CPU Store before awaiting the device.
  // Keeping that promise pending exercises the real space adjustment without
  // constructing a canvas, initializing WebGL, or copying the adjustment logic.
  const graph = new Graph({}, { spaceSize: 8192, spaceDimensions: dimensions }, new Promise(() => {}));
  if (deviceLimit !== undefined) {
    graph.store.adjustSpaceSize(graph.config.spaceSize, deviceLimit);
    graph.device = {
      limits: { maxTextureDimension2D: deviceLimit },
      get gl() { throw new Error("Simulation-space diagnostics must not access WebGL"); },
    };
  }
  return graph;
}

function seedContext(dimensions: 2 | 3, existing = new Float32Array(0)) {
  const cosmos = cpuGraph(8192, dimensions);
  cosmos.graph = { pointsNumber: existing.length / dimensions };
  cosmos.getPointPositions = vi.fn(() => existing);
  cosmos.getScaleX = vi.fn(() => undefined);
  cosmos.getScaleY = vi.fn(() => undefined);
  cosmos.setPointPositions = vi.fn();
  const context = Object.setPrototypeOf({
    config: { spaceSize: 8192, spaceDimensions: dimensions, randomSeed: seed },
    _: { cosmos },
    _preservedPointPositions: new Map(),
  }, CosmographConfigManager.prototype);
  return { context, cosmos };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("native simulation-space diagnostics", () => {
  it.each([
    { deviceLimit: 16384, effectiveSize: 8192 },
    { deviceLimit: 8192, effectiveSize: 4096 },
  ])("reports the actual native cap for a $deviceLimit device", ({ deviceLimit, effectiveSize }) => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const graph = cpuGraph(deviceLimit);
    expect(graph.getSimulationSpaceInfo()).toEqual({ requestedSize: 8192, effectiveSize, deviceLimit });
    expect(graph.config.spaceSize).toBe(8192);
    if (effectiveSize < 8192) expect(warning).toHaveBeenCalledOnce();
    else expect(warning).not.toHaveBeenCalled();
  });

  it("reports an unavailable device limit while initialization is pending", () => {
    const graph = cpuGraph();
    expect(graph.getSimulationSpaceInfo()).toEqual({
      requestedSize: 8192,
      effectiveSize: graph.store.adjustedSpaceSize,
      deviceLimit: null,
    });
    expect(graph.device).toBeUndefined();
    expect(graph.isReady).toBe(false);
  });

  it.each([2, 3] as const)("returns independent CPU snapshots without changing a %sD view", (dimensions) => {
    const graph = cpuGraph(16384, dimensions);
    const forbidden = vi.fn(() => { throw new Error("Diagnostics must not change or read the rendered view"); });
    graph.getPointPositions = forbidden;
    graph.getPointPositionsAsync = forbidden;
    graph.ensureDevice = forbidden;
    graph.requestRender = forbidden;
    graph.fitView = forbidden;
    graph.camera.getState = forbidden;
    graph.graph.inputPinnedPoints = [1, 4];
    const pinned = graph.graph.inputPinnedPoints;
    const transform = graph.store.transform.slice();
    const expected = { requestedSize: 8192, effectiveSize: 8192, deviceLimit: 16384 };
    const first = graph.getSimulationSpaceInfo();
    expect(first).toEqual(expected);
    Reflect.set(first, "effectiveSize", -1);
    const second = graph.getSimulationSpaceInfo();
    expect(second).not.toBe(first);
    expect(second).toEqual(expected);
    expect(graph.graph.inputPinnedPoints).toBe(pinned);
    expect(graph.store.transform).toEqual(transform);
    expect(graph.store.spaceDimensions).toBe(dimensions);
    expect(graph.config.spaceSize).toBe(8192);
    expect(graph.store.adjustedSpaceSize).toBe(8192);
    expect(forbidden).not.toHaveBeenCalled();
  });
});

describe("public Cosmograph simulation-space bridge", () => {
  it("returns no information before a Cosmos source exists", () => {
    expect(Reflect.apply(Cosmograph.prototype.getSimulationSpaceInfo, {}, [])).toBeUndefined();
  });

  it("forwards the current native snapshot without deriving a cap from configuration", () => {
    const snapshot = { requestedSize: 8192, effectiveSize: 4096, deviceLimit: 8192 };
    const source = { getSimulationSpaceInfo: vi.fn(() => snapshot) };
    expect(Reflect.apply(Cosmograph.prototype.getSimulationSpaceInfo, { _cosmos: source }, [])).toBe(snapshot);
    expect(source.getSimulationSpaceInfo).toHaveBeenCalledExactlyOnceWith();
  });
});

describe("effective simulation space for generated positions", () => {
  it.each([2, 3] as const)("initializes %sD positions around the effective world center", async (dimensions) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { context, cosmos } = seedContext(dimensions);
    const updated = await Reflect.apply(Reflect.get(CosmographConfigManager.prototype, "_handlePointPositions"), context, [undefined, { numRows: 8 }]);
    expect(updated).toBe(true);
    const [positions, options] = cosmos.setPointPositions.mock.calls[0];
    expect(positions).toBeInstanceOf(Float32Array);
    expect(positions).toEqual(Float32Array.from(getRandomPointPositions(8, 4096, seed, dimensions)));
    expect([...positions].every((value) => value > 1024 && value < 3072)).toBe(true);
    expect(options.dimensions).toBe(dimensions);
    expect(cosmos.getPointPositions).not.toHaveBeenCalled();
    expect(cosmos.config.spaceSize).toBe(8192);
  });

  it("preserves finite XY coordinates while initializing Z inside the effective world", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const existing = new Float32Array([125, 375, NaN, 700]);
    const { context, cosmos } = seedContext(3, existing);
    cosmos.graph.pointsNumber = 2;
    cosmos.graph.inputPointDimensions = 2;
    await Reflect.apply(Reflect.get(CosmographConfigManager.prototype, "_handlePointPositions"), context, [{ spaceDimensions: 2 }, { numRows: 2 }]);
    const expected = Float32Array.from(getRandomPointPositions(2, 4096, seed, 3));
    expected[0] = 125;
    expected[1] = 375;
    expected[4] = 700;
    expect(cosmos.setPointPositions).toHaveBeenCalledExactlyOnceWith(expected, { dimensions: 3, dontRescale: true });
    expect(existing).toEqual(new Float32Array([125, 375, NaN, 700]));
  });

  it.each([
    { dimensions: 2 as const, existingCount: 0 },
    { dimensions: 3 as const, existingCount: 0 },
    { dimensions: 2 as const, existingCount: 1 },
    { dimensions: 3 as const, existingCount: 1 },
  ])("fills missing $dimensions D nodes in the effective world with $existingCount existing node", ({ dimensions, existingCount }) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const existing = Float32Array.from([101, 202, 303].slice(0, existingCount * dimensions));
    const { cosmos } = seedContext(dimensions, existing);
    const result = Reflect.apply(fillMissingPointPositions, undefined, [cosmos, 4, seed, dimensions]);
    expect(result).toEqual([...existing, ...getRandomPointPositions(4 - existingCount, 4096, seed, dimensions)]);
    expect(result).toHaveLength(4 * dimensions);
    expect(cosmos.getPointPositions).toHaveBeenCalledExactlyOnceWith({ dimensions });
    expect(cosmos.setPointPositions).not.toHaveBeenCalled();
    expect(cosmos.config.spaceSize).toBe(8192);
  });
});
