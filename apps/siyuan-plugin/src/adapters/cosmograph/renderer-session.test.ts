import { describe, expect, it, vi } from "vitest";
import type { Cosmograph, CosmographConfig } from "@cosmograph/cosmograph";
import type { PreparedGraph } from "./prepare-graph";
import type { UploadedGraph } from "./graph-tables";
import { RendererSession, type FrameScheduler } from "./renderer-session";
import type { CameraState, Dimensions, Point2D, PointPosition } from "./geometry";
import type { ViewportApi } from "./position-adapter";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function data(id = "a", linksCount = 1): PreparedGraph {
  return {
    config: {},
    ipc: { points: new Uint8Array(), links: new Uint8Array(), encodingMs: 0 },
    indexToId: [id, "b"],
    indexToLabel: [id, "b"],
    indexToNode: [id, "b"].map((nodeId, index) => ({
      id: nodeId,
      index,
      label: nodeId,
      degree: 0,
      notebook: "",
      path: "",
      color: "#000000",
    })),
    indexToEdge: Array.from({ length: linksCount }, () => ({
      source: 0,
      target: 1,
      kind: "reference",
      weight: 1,
    })),
    idToIndex: new Map([
      [id, 0],
      ["b", 1],
    ]),
    pointsCount: 2,
    linksCount,
    preparationMs: 0,
  };
}

function dataWithIds(ids: string[]): PreparedGraph {
  return {
    ...data("unused", 0),
    indexToId: [...ids],
    indexToLabel: [...ids],
    indexToNode: ids.map((id, index) => ({
      id,
      index,
      label: id,
      degree: 0,
      notebook: "",
      path: "",
      color: "#000000",
    })),
    idToIndex: new Map(ids.map((id, index) => [id, index])),
    pointsCount: ids.length,
  };
}

function harness() {
  const order: string[] = [];
  const records = new Map<string, PreparedGraph>();
  const configurations: CosmographConfig[] = [];
  const timers = new Map<number, () => void>();
  const frames = new Map<number, () => void>();
  let sequence = 0;
  const fits = vi.fn();
  let simulationRunning = false;
  let requestedSpaceSize = 4096;
  let positions: Float32Array = new Float32Array();
  let positionDimensions: Dimensions = 2;
  let is3D = false;
  let camera: CameraState = { target: [0, 0, 0], distance: 500, azimuth: 0, polar: Math.PI / 2 };
  let pointTable: unknown;
  let zoom = 2.5;
  let translateX = 100;
  let translateY = 200;
  const width = 1000;
  const height = 600;
  const scheduler: FrameScheduler = {
    delay(callback) {
      const id = ++sequence;
      timers.set(id, callback);
      return id;
    },
    cancelDelay(id) {
      timers.delete(id);
    },
    frame(callback) {
      const id = ++sequence;
      frames.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
  };
  const graph = {
    get is3D() {
      return is3D;
    },
    get isSimulationRunning() {
      return simulationRunning;
    },
    getSimulationSpaceInfo: vi.fn((): ReturnType<Cosmograph["getSimulationSpaceInfo"]> => ({
      requestedSize: requestedSpaceSize,
      effectiveSize: requestedSpaceSize,
      deviceLimit: 16384,
    })),
    stats: { pointsCount: 0, linksCount: 0 },
    setConfig: vi.fn(async (config: CosmographConfig) => {
      configurations.push(config);
      requestedSpaceSize = config.spaceSize ?? 4096;
      const prepared = records.get(String(config.points));
      is3D = config.spaceDimensions === 3;
      if (prepared && config.points !== pointTable) {
        positionDimensions = is3D ? 3 : 2;
        positions = Float32Array.from(
          { length: prepared.pointsCount * positionDimensions },
          (_, index) => 100 + index * 10,
        );
        if (pointTable !== undefined) {
          // Cosmograph recreates Cosmos on a point-table replacement.
          zoom = 1;
          translateX = width / 2;
          translateY = height / 2;
          camera = { target: [100, 200, 300], distance: 800, azimuth: 0, polar: Math.PI / 2 };
        }
        pointTable = config.points;
      } else if (prepared && is3D && positionDimensions === 2) {
        const previous = positions;
        positions = Float32Array.from({ length: prepared.pointsCount * 3 }, (_, offset) =>
          offset % 3 === 2
            ? 50 + Math.floor(offset / 3)
            : previous[Math.floor(offset / 3) * 2 + (offset % 3)],
        );
        positionDimensions = 3;
      }
      graph.stats = {
        pointsCount: prepared?.pointsCount ?? 0,
        linksCount: prepared?.linksCount ?? 0,
      };
      order.push("configured");
    }),
    reset: vi.fn(async () => {
      graph.stats = { pointsCount: 0, linksCount: 0 };
      positions = new Float32Array();
      pointTable = undefined;
      zoom = 1;
      translateX = width / 2;
      translateY = height / 2;
      order.push("reset");
    }),
    destroy: vi.fn(async () => {
      order.push("destroy");
    }),
    pause: vi.fn(() => {
      simulationRunning = false;
    }),
    unpause: vi.fn(() => {
      simulationRunning = true;
    }),
    start: vi.fn(() => {
      simulationRunning = true;
    }),
    selectPoints: vi.fn(),
    setFocusedPoint: vi.fn(),
    setPinnedPoints: vi.fn(),
    fitViewByCoordinates: vi.fn((_coordinates: number[], duration?: number, padding?: number) => {
      fits(duration, padding);
    }),
    getZoomLevel: vi.fn(() => {
      if (is3D) throw new Error("2D zoom getter used in 3D");
      return zoom;
    }),
    setZoomLevel: vi.fn((value: number) => {
      if (is3D) throw new Error("2D zoom setter used in 3D");
      const x = (width / 2 - translateX) / zoom;
      const y = (translateY - height / 2) / zoom;
      zoom = value;
      translateX = width / 2 - x * zoom;
      translateY = height / 2 + y * zoom;
    }),
    getCanvas: vi.fn(
      () => ({ getBoundingClientRect: () => ({ width, height }) }) as HTMLCanvasElement,
    ),
    screenToSpacePosition: vi.fn(
      (point: Point2D, options?: { dimensions?: Dimensions }): PointPosition =>
        options?.dimensions === 3
          ? [
              point[0] - width / 2 + camera.target[0],
              height / 2 - point[1] + camera.target[1],
              camera.target[2],
            ]
          : [(point[0] - translateX) / zoom, (translateY - point[1]) / zoom],
    ) as ViewportApi["screenToSpacePosition"],
    spaceToScreenPosition: vi.fn(
      (point: [number, number] | [number, number, number]): [number, number] => [
        point[0] * zoom + translateX,
        translateY - point[1] * zoom,
      ],
    ),
    setZoomTransformByPointPositions: vi.fn(
      (points: Float32Array, duration?: number, scale?: number, padding?: number) => {
        if (is3D) throw new Error("2D framing used in 3D");
        if (scale === undefined) {
          fits(duration, padding);
          return;
        }
        zoom = scale ?? zoom;
        translateX = width / 2 - points[0] * zoom;
        translateY = height / 2 + points[1] * zoom;
      },
    ),
    getCameraState: vi.fn(() =>
      is3D ? { ...camera, target: [...camera.target] as [number, number, number] } : undefined,
    ),
    setCameraState: vi.fn((state: Partial<CameraState>) => {
      camera = { ...camera, ...state };
    }),
    getPointPositions: vi.fn((options?: { dimensions?: Dimensions }) => {
      const dimensions = options?.dimensions ?? 2;
      if (dimensions === positionDimensions) return positions;
      return Float32Array.from(
        { length: (positions.length / positionDimensions) * dimensions },
        (_, offset) => {
          const axis = offset % dimensions;
          return axis < positionDimensions
            ? positions[Math.floor(offset / dimensions) * positionDimensions + axis]
            : 0;
        },
      );
    }),
    setPointPositions: vi.fn((next: Float32Array, options?: { dimensions?: Dimensions }) => {
      positions = new Float32Array(next);
      positionDimensions = options?.dimensions ?? 2;
    }),
    render: vi.fn(),
  };
  const tables = {
    active: null as UploadedGraph | null,
    stage: vi.fn(async (prepared: PreparedGraph): Promise<UploadedGraph> => {
      if (tables.active?.prepared === prepared) return tables.active;
      const points = `points_${records.size}`;
      records.set(points, prepared);
      return { prepared, points, links: `${points}_links` };
    }),
    commit: vi.fn(async (uploaded: UploadedGraph) => {
      tables.active = uploaded;
      order.push("commit");
    }),
    discard: vi.fn(async () => {
      order.push("discard");
    }),
    clear: vi.fn(async () => {
      tables.active = null;
      order.push("clear");
    }),
  };
  const drain = vi.fn(async () => {
    order.push("drain");
  });
  const close = vi.fn(async () => {
    order.push("close");
  });
  const failure = vi.fn();
  const session = new RendererSession(graph, tables, drain, close, failure, scheduler);
  return {
    session,
    fits,
    settle: () => {
      simulationRunning = false;
    },
    graph,
    tables,
    order,
    close,
    failure,
    timers,
    frames,
    configurations,
    records,
  };
}

function flushScheduledFrames(h: ReturnType<typeof harness>) {
  for (const [id, callback] of [...h.timers]) {
    h.timers.delete(id);
    callback();
  }
  for (const [id, callback] of [...h.frames]) {
    h.frames.delete(id);
    callback();
  }
}

describe("renderer lifetime", () => {
  it.each([2, 3] as const)(
    "samples each explicit %sD fit once without rebuilding, reheating or changing pause",
    async (dimensions) => {
      const h = harness();
      h.session.controls(null, true, [], ["a"]);
      await h.session.update(data(), { spaceDimensions: dimensions, spaceSize: 8192 });
      flushScheduledFrames(h);
      const previousSample = h.session.getDiagnostics().layoutSample;
      h.graph.getPointPositions.mockClear();
      h.graph.getSimulationSpaceInfo.mockClear();
      h.graph.setConfig.mockClear();
      h.graph.setPointPositions.mockClear();
      h.graph.start.mockClear();
      h.graph.pause.mockClear();
      h.graph.unpause.mockClear();
      h.graph.setPinnedPoints.mockClear();
      h.graph.setCameraState.mockClear();
      h.graph.setZoomLevel.mockClear();
      h.graph.setZoomTransformByPointPositions.mockClear();
      h.graph.fitViewByCoordinates.mockClear();
      h.session.fit();
      flushScheduledFrames(h);
      expect(h.graph.getPointPositions).toHaveBeenCalledExactlyOnceWith({ dimensions });
      expect(h.graph.getSimulationSpaceInfo).toHaveBeenCalledExactlyOnceWith();
      if (dimensions === 2)
        expect(h.graph.setZoomTransformByPointPositions).toHaveBeenCalledExactlyOnceWith(
          h.graph.getPointPositions.mock.results[0].value,
          0,
          undefined,
          0.15,
        );
      else
        expect(h.graph.fitViewByCoordinates).toHaveBeenCalledExactlyOnceWith(
          [100, 110, 120, 130, 140, 150],
          0,
          0.15,
        );
      expect(h.graph.start).not.toHaveBeenCalled();
      expect(h.graph.pause).not.toHaveBeenCalled();
      expect(h.graph.unpause).not.toHaveBeenCalled();
      expect(h.graph.setConfig).not.toHaveBeenCalled();
      expect(h.graph.setPointPositions).not.toHaveBeenCalled();
      expect(h.graph.setPinnedPoints).not.toHaveBeenCalled();
      expect(h.graph.setCameraState).not.toHaveBeenCalled();
      expect(h.graph.setZoomLevel).not.toHaveBeenCalled();
      expect(h.graph.isSimulationRunning).toBe(false);
      expect(h.session.getDiagnostics()).toMatchObject({
        dataRevisions: 1,
        layoutSample: previousSample + 1,
        layoutSnapshot: {
          count: 2,
          dimensions,
          min: dimensions === 2 ? [100, 110] : [100, 110, 120],
          max: dimensions === 2 ? [120, 130] : [130, 140, 150],
          centroid: dimensions === 2 ? [110, 120] : [115, 125, 135],
        },
        layoutSimulationRunning: false,
        layoutSpaceInfo: { requestedSize: 8192, effectiveSize: 8192, deviceLimit: 16384 },
        chosenIds: ["a"],
        pinnedCount: 1,
      });
      expect(h.session.getDiagnostics().layoutSampledAt).toEqual(expect.any(Number));
      h.session.fit();
      flushScheduledFrames(h);
      expect(h.graph.getPointPositions).toHaveBeenCalledTimes(2);
      expect(h.session.getDiagnostics().layoutSample).toBe(previousSample + 2);
      await h.session.dispose();
    },
  );

  it("samples actual XY after returning from 3D and preserves natural settling independently of the pause toggle", async () => {
    const h = harness();
    const prepared = data();
    await h.session.update(prepared, { spaceDimensions: 3 });
    await h.session.update(prepared, { spaceDimensions: 2 });
    flushScheduledFrames(h);
    expect(h.session.positionDimensions).toBe(3);
    h.settle();
    h.graph.getPointPositions.mockClear();
    h.graph.start.mockClear();
    h.graph.unpause.mockClear();
    h.session.fit();
    flushScheduledFrames(h);
    expect(h.graph.getPointPositions).toHaveBeenCalledExactlyOnceWith({ dimensions: 2 });
    expect(h.session.getDiagnostics()).toMatchObject({
      layoutSnapshot: { dimensions: 2 },
      layoutSimulationRunning: false,
    });
    expect(h.graph.isSimulationRunning).toBe(false);
    expect(h.graph.start).not.toHaveBeenCalled();
    expect(h.graph.unpause).not.toHaveBeenCalled();
    await h.session.dispose();
  });

  it("keeps a retained sample's data revision until Fit samples the replacement graph", async () => {
    const h = harness();
    expect(h.session.getDiagnostics().layoutDataRevision).toBeNull();
    expect(h.session.getDiagnostics().layoutSpaceInfo).toBeNull();
    await h.session.update(dataWithIds(["a", "b"]), {});
    flushScheduledFrames(h);
    const first = h.session.getDiagnostics();
    expect(first).toMatchObject({
      dataRevisions: 1,
      layoutDataRevision: 1,
      layoutSnapshot: { count: 2 },
    });

    await h.session.update(dataWithIds(["a", "b", "new"]), {});
    flushScheduledFrames(h);
    const replaced = h.session.getDiagnostics();
    expect(replaced.dataRevisions).toBe(2);
    expect(replaced.layoutDataRevision).toBe(1);
    expect(replaced.layoutSnapshot).toBe(first.layoutSnapshot);
    expect(replaced.layoutSampledAt).toBe(first.layoutSampledAt);
    expect(replaced.layoutSample).toBe(first.layoutSample);
    expect(replaced.layoutSpaceInfo).toBe(first.layoutSpaceInfo);
    expect(h.graph.getSimulationSpaceInfo).toHaveBeenCalledTimes(1);

    h.session.fit();
    flushScheduledFrames(h);
    expect(h.session.getDiagnostics()).toMatchObject({
      dataRevisions: 2,
      layoutDataRevision: 2,
      layoutSample: first.layoutSample + 1,
      layoutSnapshot: { count: 3 },
    });
    expect(h.session.getDiagnostics().layoutSpaceInfo).not.toBe(first.layoutSpaceInfo);
    expect(h.graph.getSimulationSpaceInfo).toHaveBeenCalledTimes(2);
    await h.session.dispose();
  });

  it("records effective device-limited bounds from the public getter with the owning Fit sample", async () => {
    const h = harness();
    const reported = { requestedSize: 8192, effectiveSize: 4096, deviceLimit: 8192 };
    h.graph.getSimulationSpaceInfo.mockReturnValue(reported);
    h.session.controls("a", true, [], ["a"]);
    await h.session.update(data(), { spaceSize: 8192 });
    flushScheduledFrames(h);
    const first = h.session.getDiagnostics();
    expect(first).toMatchObject({
      layoutDataRevision: 1,
      layoutSpaceInfo: reported,
      layoutSimulationRunning: false,
    });
    expect(first.layoutSpaceInfo).not.toBe(reported);
    h.graph.getPointPositions.mockClear();
    h.graph.getSimulationSpaceInfo.mockClear();
    h.graph.getSimulationSpaceInfo.mockReturnValueOnce(undefined);
    h.session.fit();
    flushScheduledFrames(h);
    expect(h.graph.getPointPositions).toHaveBeenCalledExactlyOnceWith({ dimensions: 2 });
    expect(h.graph.getSimulationSpaceInfo).toHaveBeenCalledExactlyOnceWith();
    expect(h.session.getDiagnostics()).toMatchObject({
      layoutSample: first.layoutSample + 1,
      layoutDataRevision: 1,
      layoutSpaceInfo: null,
      layoutSimulationRunning: false,
      chosenIds: ["a"],
      pinnedCount: 1,
    });
    await h.session.dispose();
  });

  it("retains the construction world extent through appearance, outline, and table updates without resetting manual positions", async () => {
    const h = harness();
    const base = { spaceSize: 8192, simulationGravity: 0.12, simulationLinkSpring: 0.4 };
    await h.session.initialize(base);
    h.session.controls("a", true, [], ["a", "b"]);
    const prepared = dataWithIds(["a", "b"]);
    await h.session.update(prepared, base);
    flushScheduledFrames(h);
    h.graph.setPointPositions(new Float32Array([1000, 1100, 2000, 2100]));
    h.graph.setZoomLevel(4);
    const beforeA = h.graph.spaceToScreenPosition([1000, 1100]);
    const beforeB = h.graph.spaceToScreenPosition([2000, 2100]);
    h.fits.mockClear();
    h.graph.setPointPositions.mockClear();
    await h.session.update(prepared, { ...base, pointSizeScale: 6 });
    expect(h.graph.setPointPositions).not.toHaveBeenCalled();
    h.session.controls("b", true, ["b"], ["a"]);
    await vi.waitFor(() => expect(h.session.getDiagnostics().outlinedCount).toBe(1));
    await h.session.update(dataWithIds(["b", "new", "a"]), { ...base, pointSizeScale: 6 });
    expect([...h.graph.getPointPositions()]).toEqual([2000, 2100, 120, 130, 1000, 1100]);
    expect(h.graph.spaceToScreenPosition([1000, 1100])).toEqual(beforeA);
    expect(h.graph.spaceToScreenPosition([2000, 2100])).toEqual(beforeB);
    expect(h.graph.getZoomLevel()).toBe(4);
    expect(h.graph.setPinnedPoints).toHaveBeenLastCalledWith([2]);
    expect(h.graph.isSimulationRunning).toBe(false);
    expect(h.graph.start).not.toHaveBeenCalled();
    expect(h.fits).not.toHaveBeenCalled();
    expect(h.configurations.length).toBeGreaterThanOrEqual(5);
    for (const config of h.configurations) expect(config).toMatchObject(base);
    h.session.fit();
    flushScheduledFrames(h);
    expect(h.session.getDiagnostics()).toMatchObject({
      layoutDataRevision: 2,
      layoutSpaceInfo: { requestedSize: 8192, effectiveSize: 8192, deviceLimit: 16384 },
      chosenIds: ["a"],
      pinnedCount: 1,
    });
    await h.session.dispose();
  });

  it("restores a naturally stopped state if a coordinate-fit implementation unexpectedly resumes it", async () => {
    const h = harness();
    await h.session.update(data(), {});
    flushScheduledFrames(h);
    h.settle();
    h.graph.pause.mockClear();
    h.graph.setZoomTransformByPointPositions.mockImplementationOnce(() => h.graph.unpause());
    h.session.fit();
    flushScheduledFrames(h);
    expect(h.graph.isSimulationRunning).toBe(false);
    expect(h.graph.pause).toHaveBeenCalledTimes(1);
    expect(h.session.getDiagnostics().layoutSimulationRunning).toBe(false);
    await h.session.dispose();
  });

  it("restores XYZ by stable ID and the full 3D orbit camera across a data rebuild", async () => {
    const h = harness();
    h.session.controls("a", true, [], ["a", "c"]);
    await h.session.update(dataWithIds(["a", "b", "c"]), { spaceDimensions: 3 });
    h.graph.setPointPositions(new Float32Array([10, 20, 30, 40, 50, 60, 70, 80, 90]), {
      dimensions: 3,
    });
    const camera: CameraState = { target: [4, 8, 12], distance: 321, azimuth: 0.9, polar: 1.2 };
    h.graph.setCameraState(camera);
    h.graph.getZoomLevel.mockClear();
    await h.session.update(dataWithIds(["c", "new", "a"]), { spaceDimensions: 3 });
    expect([...h.graph.getPointPositions({ dimensions: 3 })]).toEqual([
      70, 80, 90, 130, 140, 150, 10, 20, 30,
    ]);
    expect(h.graph.getCameraState()).toEqual(camera);
    expect(h.graph.setPinnedPoints).toHaveBeenLastCalledWith([0, 2]);
    expect(h.graph.getZoomLevel).not.toHaveBeenCalled();
    expect(h.session.getDiagnostics()).toMatchObject({
      dimensions: 3,
      camera,
      chosenIds: ["c", "a"],
      pinnedCount: 2,
      restoredPointCount: 2,
    });
    await h.session.dispose();
  });

  it("lets the first 3D switch seed Z and retains it through 2D updates and a return to 3D", async () => {
    const h = harness();
    const initial = dataWithIds(["a", "b"]);
    h.session.controls(null, true, [], ["a", "b"]);
    await h.session.update(initial, { spaceDimensions: 2 });
    h.graph.setPointPositions(new Float32Array([10, 20, 30, 40]));
    await h.session.update(initial, { spaceDimensions: 3 });
    expect([...h.graph.getPointPositions({ dimensions: 3 })]).toEqual([10, 20, 50, 30, 40, 51]);
    expect(h.session.positionDimensions).toBe(3);
    await h.session.update(initial, { spaceDimensions: 2 });
    const reordered = dataWithIds(["b", "a"]);
    await h.session.update(reordered, { spaceDimensions: 2 });
    expect([...h.graph.getPointPositions({ dimensions: 3 })]).toEqual([30, 40, 51, 10, 20, 50]);
    await h.session.update(reordered, { spaceDimensions: 3 });
    expect([...h.graph.getPointPositions({ dimensions: 3 })]).toEqual([30, 40, 51, 10, 20, 50]);
    expect(h.session.getDiagnostics().dataRevisions).toBe(2);
    expect(h.graph.setPinnedPoints).toHaveBeenLastCalledWith([0, 1]);
    await h.session.dispose();
  });

  it("redraws a hidden 3D view with its orbit state and restores pause without 2D zoom APIs", async () => {
    const h = harness();
    h.session.controls(null, true);
    await h.session.update(data(), { spaceDimensions: 3 });
    flushScheduledFrames(h);
    const camera: CameraState = { target: [20, 30, 40], distance: 1234, azimuth: 0.8, polar: 1.7 };
    h.graph.setCameraState(camera);
    h.graph.setCameraState.mockClear();
    h.graph.getZoomLevel.mockClear();
    h.graph.unpause.mockClear();
    h.session.setActive(false);
    h.session.setActive(true);
    flushScheduledFrames(h);
    expect(h.graph.setCameraState).toHaveBeenCalledExactlyOnceWith(camera, 0);
    expect(h.graph.getZoomLevel).not.toHaveBeenCalled();
    expect(h.graph.unpause).not.toHaveBeenCalled();
    await h.session.dispose();
  });

  it("applies force changes to a settled layout while deferring reheating until the user resumes", async () => {
    const h = harness();
    const prepared = data();
    h.session.controls(null, true, [], ["a"]);
    await h.session.update(prepared, { simulationRepulsion: 0.8 });
    await h.session.update(prepared, { simulationRepulsion: 2 });
    expect(h.graph.start).not.toHaveBeenCalled();
    h.session.controls(null, false, [], ["a"]);
    expect(h.graph.start).toHaveBeenCalledExactlyOnceWith(0.3);
    h.graph.start.mockClear();
    await h.session.update(prepared, { simulationRepulsion: 2, linkOpacity: 0.5 });
    expect(h.graph.start).not.toHaveBeenCalled();
    expect(h.session.getDiagnostics().dataRevisions).toBe(1);
    await h.session.dispose();
  });

  it("changes community membership and strength without replacing topology or moving paused pins", async () => {
    const h = harness();
    const prepared = data();
    h.session.controls("a", true, ["a"], ["a"]);
    await h.session.update(prepared, { simulationCluster: 0 });
    h.graph.setPointPositions(new Float32Array([11, 22, 33, 44]));
    const clustering = {
      pointClusterBy: "index",
      pointClusterByFn: () => 0,
      simulationCluster: 0.4,
    };
    await h.session.update(prepared, clustering);
    expect([...h.graph.getPointPositions()]).toEqual([11, 22, 33, 44]);
    expect(h.graph.start).not.toHaveBeenCalled();
    expect(h.session.getDiagnostics()).toMatchObject({
      dataRevisions: 1,
      chosenIds: ["a"],
      pinnedCount: 1,
      inspectedId: "a",
    });
    h.session.controls("a", false, ["a"], ["a"]);
    expect(h.graph.start).toHaveBeenCalledExactlyOnceWith(0.3);
    await h.session.dispose();
  });

  it("waits for an in-flight rebuild before destroying GPU, tables, and database", async () => {
    const h = harness();
    await h.session.update(data(), {});
    h.graph.selectPoints.mockClear();
    h.graph.pause.mockClear();
    h.graph.unpause.mockClear();
    const started = deferred();
    const finish = deferred();
    h.graph.setConfig.mockImplementationOnce(async () => {
      started.resolve();
      await finish.promise;
      h.order.push("rebuild-finished");
    });
    const update = h.session.update(data("c"), {});
    await started.promise;
    // Capturing coordinates pauses the old simulation before a data replacement.
    h.graph.pause.mockClear();
    h.session.controls("b", true);
    h.session.fit();
    expect(h.graph.pause).not.toHaveBeenCalled();
    expect(h.graph.selectPoints).not.toHaveBeenCalled();
    expect(h.fits).not.toHaveBeenCalled();
    const closing = h.session.dispose();
    expect(h.graph.destroy).not.toHaveBeenCalled();
    finish.resolve();
    expect(await update).toBeNull();
    await closing;
    expect(h.order.indexOf("rebuild-finished")).toBeLessThan(h.order.indexOf("destroy"));
    expect(h.order.indexOf("destroy")).toBeLessThan(h.order.indexOf("clear"));
    expect(h.order.indexOf("clear")).toBeLessThan(h.order.indexOf("close"));
    h.session.controls("a", false);
    h.session.fit();
    expect(h.graph.selectPoints).not.toHaveBeenCalled();
    expect(h.close).toHaveBeenCalledTimes(1);
    await h.session.dispose();
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it("skips superseded queued configurations and rejects stale label callbacks", async () => {
    const h = harness();
    const started = deferred();
    const finish = deferred();
    const setConfig = h.graph.setConfig.getMockImplementation()!;
    h.graph.setConfig.mockImplementationOnce(async (config) => {
      started.resolve();
      await finish.promise;
      await setConfig(config);
    });
    const clicked = vi.fn();
    const first = h.session.update(data("old"), { onLabelClick: clicked });
    await started.promise;
    const middle = h.session.update(data("skipped"), { onLabelClick: clicked });
    const last = h.session.update(data("new"), { onLabelClick: clicked });
    finish.resolve();
    expect(await first).toBeNull();
    expect(await middle).toBeNull();
    expect(await last).toMatchObject({ pointsCount: 2, linksCount: 1 });
    expect(h.graph.setConfig).toHaveBeenCalledTimes(2);
    h.configurations[0].onLabelClick?.(0, "old", {} as MouseEvent);
    expect(clicked).not.toHaveBeenCalled();
    h.configurations[1].onLabelClick?.(0, "new", {} as MouseEvent);
    expect(clicked).toHaveBeenCalledWith(0, "new", {});
    await h.session.dispose();
  });

  it("cancels fit timers and frames and guards a callback already dequeued by the browser", async () => {
    const h = harness();
    await h.session.update(data(), {});
    const timer = h.timers.values().next().value!;
    timer();
    const frame = h.frames.values().next().value!;
    h.session.suspend();
    expect(h.frames.size).toBe(0);
    frame();
    expect(h.fits).not.toHaveBeenCalled();
    await h.session.dispose();
    timer();
    frame();
    expect(h.fits).not.toHaveBeenCalled();
  });

  it("fits the first displayed graph but preserves the camera on later data and scope updates", async () => {
    const h = harness();
    await h.session.update(data("initial"), {});
    flushScheduledFrames(h);
    expect(h.fits).toHaveBeenCalledExactlyOnceWith(0, 0.15);
    h.fits.mockClear();
    await h.session.update(data("refreshed"), {});
    await h.session.update(data("scope-changed"), {});
    expect(h.timers.size).toBe(0);
    flushScheduledFrames(h);
    expect(h.fits).not.toHaveBeenCalled();
    expect(h.graph.setZoomLevel).not.toHaveBeenCalled();
    expect(h.configurations.every((config) => config.fitViewOnInit === false)).toBe(true);
    await h.session.dispose();
  });

  it("keeps initial fitting pending through an empty view without fitting later empty-to-populated changes", async () => {
    const h = harness();
    const empty: PreparedGraph = {
      ipc: { points: new Uint8Array(), links: new Uint8Array(), encodingMs: 0 },
      config: {},
      indexToId: [],
      indexToLabel: [],
      indexToNode: [],
      indexToEdge: [],
      idToIndex: new Map(),
      pointsCount: 0,
      linksCount: 0,
      preparationMs: 0,
    };
    await h.session.update(empty, {});
    expect(h.timers.size).toBe(0);
    expect(h.fits).not.toHaveBeenCalled();
    await h.session.update(data("loaded"), {});
    flushScheduledFrames(h);
    expect(h.fits).toHaveBeenCalledTimes(1);
    h.fits.mockClear();
    await h.session.update(empty, {});
    await h.session.update(data("restored"), {});
    expect(h.timers.size).toBe(0);
    flushScheduledFrames(h);
    expect(h.fits).not.toHaveBeenCalled();
    await h.session.dispose();
  });

  it("honors an explicit fit after initial fitting and guards its stale frame across replacement", async () => {
    const h = harness();
    await h.session.update(data("initial"), {});
    flushScheduledFrames(h);
    h.fits.mockClear();
    h.session.fit();
    const timer = h.timers.values().next().value!;
    h.timers.clear();
    timer();
    const staleFrame = h.frames.values().next().value!;
    await h.session.update(data("newer"), {});
    staleFrame();
    expect(h.fits).not.toHaveBeenCalled();
    flushScheduledFrames(h);
    expect(h.fits).toHaveBeenCalledExactlyOnceWith(0, 0.15);
    h.session.fit();
    flushScheduledFrames(h);
    expect(h.fits).toHaveBeenCalledTimes(2);
    await h.session.dispose();
  });

  it("preserves chosen world and screen coordinates across a reordered data refresh with a new node", async () => {
    const h = harness();
    h.session.controls("a", true, ["a", "b"], ["a", "b"]);
    await h.session.update(dataWithIds(["a", "b"]), {});
    flushScheduledFrames(h);
    h.graph.setPointPositions(new Float32Array([100.25, -40.5, 500.75, 60.125]));
    h.graph.setZoomLevel(4);
    const beforeA = h.graph.spaceToScreenPosition([100.25, -40.5]);
    const beforeB = h.graph.spaceToScreenPosition([500.75, 60.125]);
    h.fits.mockClear();
    h.graph.unpause.mockClear();
    h.graph.getPointPositions.mockClear();
    await h.session.update(dataWithIds(["new", "b", "a"]), {});
    // Capture the old layout and merge the new one; diagnostics must not add a third read.
    expect(h.graph.getPointPositions).toHaveBeenCalledTimes(2);
    expect([...h.graph.getPointPositions()]).toEqual([100, 110, 500.75, 60.125, 100.25, -40.5]);
    expect(h.graph.spaceToScreenPosition([100.25, -40.5])).toEqual(beforeA);
    expect(h.graph.spaceToScreenPosition([500.75, 60.125])).toEqual(beforeB);
    expect(h.graph.getZoomLevel()).toBe(4);
    expect(h.graph.setPinnedPoints).toHaveBeenLastCalledWith([1, 2]);
    expect(h.fits).not.toHaveBeenCalled();
    expect(h.graph.unpause).not.toHaveBeenCalled();
    expect(h.session.getDiagnostics()).toMatchObject({
      dataRevisions: 2,
      restoredPointCount: 2,
      zoomBefore: 4,
      zoomAfter: 4,
      chosenIds: ["b", "a"],
      pinnedCount: 2,
    });
    await h.session.dispose();
  });

  it("uses the actual GPU table identity when an intermediate rebuild is superseded", async () => {
    const h = harness();
    h.session.controls(null, true, [], ["a", "b"]);
    await h.session.update(dataWithIds(["a", "b"]), {});
    h.graph.setPointPositions(new Float32Array([11, 22, 33, 44]));
    const started = deferred();
    const release = deferred();
    const setConfig = h.graph.setConfig.getMockImplementation()!;
    h.graph.setConfig.mockImplementationOnce(async (config) => {
      started.resolve();
      await release.promise;
      await setConfig(config);
    });
    const intermediate = h.session.update(dataWithIds(["b", "temporary", "a"]), {});
    await started.promise;
    const latest = h.session.update(dataWithIds(["a", "b", "final"]), {});
    release.resolve();
    expect(await intermediate).toBeNull();
    await latest;
    expect([...h.graph.getPointPositions()]).toEqual([11, 22, 33, 44, 140, 150]);
    expect(h.session.getDiagnostics().chosenIds).toEqual(["a", "b"]);
    expect(h.graph.getZoomLevel()).toBe(2.5);
    await h.session.dispose();
  });

  it("keeps only the previous displayed layout instead of an archive of hidden nodes", async () => {
    const h = harness();
    await h.session.update(dataWithIds(["a", "b"]), {});
    h.graph.setPointPositions(new Float32Array([11, 22, 33, 44]));
    await h.session.update(dataWithIds(["b", "new"]), {});
    expect([...h.graph.getPointPositions()]).toEqual([33, 44, 120, 130]);
    await h.session.update(dataWithIds(["a", "b", "new"]), {});
    expect([...h.graph.getPointPositions()]).toEqual([100, 110, 33, 44, 120, 130]);
    expect(h.session.getDiagnostics().restoredPointCount).toBe(2);
    await h.session.dispose();
  });

  it("does not rewrite positions or camera for a visual-only configuration change", async () => {
    const h = harness();
    const prepared = data();
    await h.session.update(prepared, {});
    h.graph.setPointPositions(new Float32Array([11, 22, 33, 44]));
    h.graph.setPointPositions.mockClear();
    h.graph.setZoomTransformByPointPositions.mockClear();
    await h.session.update(prepared, { pointColorBy: "color" });
    expect([...h.graph.getPointPositions()]).toEqual([11, 22, 33, 44]);
    expect(h.graph.setPointPositions).not.toHaveBeenCalled();
    expect(h.graph.setZoomTransformByPointPositions).not.toHaveBeenCalled();
    await h.session.dispose();
  });

  it("applies only the latest requested controls after a rebuild completes", async () => {
    const h = harness();
    const started = deferred();
    const finish = deferred();
    const setConfig = h.graph.setConfig.getMockImplementation()!;
    h.graph.setConfig.mockImplementationOnce(async (config) => {
      started.resolve();
      await finish.promise;
      await setConfig(config);
    });
    const pending = h.session.update(data(), {});
    await started.promise;
    h.session.controls("a", false);
    h.session.controls("b", true);
    finish.resolve();
    await pending;
    expect(h.graph.selectPoints).toHaveBeenCalledExactlyOnceWith([1], false, true);
    expect(h.graph.pause).toHaveBeenCalled();
    expect(h.graph.unpause).not.toHaveBeenCalled();
    await h.session.dispose();
  });

  it("reports a live rebuild failure rather than treating it as cancellation", async () => {
    const h = harness();
    const failure = new Error("GPU upload failed");
    h.graph.setConfig.mockImplementationOnce(async (config) => {
      config.onGraphRebuildError?.(failure);
    });
    await expect(h.session.update(data(), {})).rejects.toBe(failure);
    expect(h.session.isInteractive).toBe(false);
    h.session.fit();
    h.session.controls("a", false);
    expect(h.fits).not.toHaveBeenCalled();
    expect(h.graph.selectPoints).not.toHaveBeenCalled();
    await h.session.dispose();
  });

  it("retains a defined links table through linked, zero-link, and linked updates", async () => {
    const h = harness();
    await h.session.update(data("one", 1), {});
    await h.session.update(data("two", 0), {});
    await h.session.update(data("three", 2), {});
    expect(h.configurations.every((config) => typeof config.links === "string")).toBe(true);
    expect(h.configurations.every((config) => config.fitViewOnInit === false)).toBe(true);
    expect(h.session.counts).toEqual({ nodes: 2, links: 2 });
    await h.session.dispose();
  });

  it("resumes a settled paused graph at its existing zoom without touching data, configuration, or selection", async () => {
    const h = harness();
    h.session.controls("a", true, ["a", "b"]);
    const prepared = data();
    await h.session.update(prepared, {});
    h.timers.values().next().value!();
    h.frames.values().next().value!();
    h.fits.mockClear();
    h.graph.setConfig.mockClear();
    h.tables.stage.mockClear();
    h.graph.selectPoints.mockClear();
    h.frames.clear();
    const diagnostics = h.session.getDiagnostics();

    h.session.setActive(false);
    expect(h.session.isInteractive).toBe(false);
    expect(h.session.displayed).toBe(prepared);
    h.session.setActive(true);
    expect(h.session.isInteractive).toBe(true);
    h.frames.values().next().value!();
    expect(h.graph.setZoomLevel).toHaveBeenCalledExactlyOnceWith(2.5, 0);
    expect(h.graph.unpause).not.toHaveBeenCalled();
    expect(h.fits).not.toHaveBeenCalled();
    expect(h.graph.selectPoints).not.toHaveBeenCalled();
    expect(h.graph.setConfig).not.toHaveBeenCalled();
    expect(h.tables.stage).not.toHaveBeenCalled();
    expect(h.session.getDiagnostics()).toEqual(diagnostics);
    await h.session.dispose();
  });

  it("defers hidden controls and initial fitting, then discards stale visibility frames", async () => {
    const h = harness();
    h.session.setActive(false);
    await h.session.update(data(), {});
    h.session.controls("b", false, ["a", "b"]);
    expect(h.graph.pause).toHaveBeenCalled();
    expect(h.graph.unpause).not.toHaveBeenCalled();
    expect(h.graph.selectPoints).not.toHaveBeenCalled();
    expect(h.timers.size).toBe(0);
    h.session.setActive(true);
    expect(h.graph.selectPoints).toHaveBeenCalledExactlyOnceWith([1, 0], false, true);
    expect(h.graph.setFocusedPoint).toHaveBeenCalledExactlyOnceWith(1);
    expect(h.graph.unpause).toHaveBeenCalledTimes(1);
    const staleRefresh = h.frames.values().next().value!;
    h.session.setActive(false);
    expect(h.frames.size).toBe(0);
    h.session.setActive(true);
    staleRefresh();
    expect(h.graph.setZoomLevel).not.toHaveBeenCalled();
    const refresh = h.frames.values().next().value!;
    refresh();
    expect(h.graph.setZoomLevel).toHaveBeenCalledTimes(1);
    expect(h.timers.size).toBe(1);
    await h.session.dispose();
    refresh();
    expect(h.graph.setZoomLevel).toHaveBeenCalledTimes(1);
  });

  it("does not execute a fit frame dequeued before a hide/show cycle", async () => {
    const h = harness();
    await h.session.update(data(), {});
    h.timers.values().next().value!();
    const staleFit = h.frames.values().next().value!;
    h.session.setActive(false);
    h.session.setActive(true);
    staleFit();
    expect(h.fits).not.toHaveBeenCalled();
    expect(h.frames.size).toBe(1);
    await h.session.dispose();
    expect(h.frames.size).toBe(0);
  });

  it("maps a whole requested neighborhood to current dense indices and distinguishes its root", async () => {
    const h = harness();
    const prepared = data();
    prepared.idToIndex.set("c", 2);
    prepared.indexToId.push("c");
    prepared.indexToLabel.push("c");
    prepared.pointsCount = 3;
    h.session.controls("b", false, ["a", "b", "c", "outside", "c"]);
    await h.session.update(prepared, {});
    expect(h.graph.selectPoints).toHaveBeenLastCalledWith([1, 0, 2], false, true);
    expect(h.graph.setFocusedPoint).toHaveBeenLastCalledWith(1);
    const calls = h.graph.selectPoints.mock.calls.length;
    h.session.controls("b", false, ["a", "b", "c", "outside", "c"]);
    h.session.controls("b", true, ["a", "b", "c", "outside", "c"]);
    expect(h.graph.selectPoints).toHaveBeenCalledTimes(calls);
    h.session.controls(null, true, []);
    expect(h.graph.selectPoints).toHaveBeenLastCalledWith(null, false, true);
    expect(h.graph.setFocusedPoint).toHaveBeenLastCalledWith(undefined);
    await h.session.dispose();
  });

  it("lets visual configuration choose a prepared color column without replacing the prepared graph", async () => {
    const h = harness();
    const prepared = data();
    prepared.config.pointColorBy = "branchColor";
    await h.session.update(prepared, { pointColorBy: "degreeColor" });
    const uploaded = h.tables.active;
    await h.session.update(prepared, { pointColorBy: "color" });
    expect(h.tables.active).toBe(uploaded);
    expect(h.configurations.map((config) => config.pointColorBy)).toEqual(["degreeColor", "color"]);
    await h.session.dispose();
  });

  it("reports actual configuration completions and resolved highlights independently of requested controls", async () => {
    const h = harness();
    const notified = vi.fn();
    const unsubscribe = h.session.subscribe(notified);
    const identity = h.session.getDiagnostics().sessionId;
    expect(harness().session.getDiagnostics().sessionId).not.toBe(identity);
    await h.session.initialize({});
    const prepared = data();
    h.session.controls("b", false, ["a", "b", "outside"]);
    await h.session.update(prepared, {});
    expect(h.session.getDiagnostics()).toMatchObject({
      sessionId: identity,
      configurations: 2,
      dataRevisions: 1,
      requestedHighlightCount: 2,
      highlightedCount: 0,
      inspectedId: "b",
    });
    h.configurations.at(-1)!.onPointsFiltered?.({} as never, [0, 1], [0]);
    expect(h.session.getDiagnostics().highlightedCount).toBe(2);
    expect(notified).toHaveBeenCalled();
    unsubscribe();
    notified.mockClear();
    await h.session.update(prepared, { pointColorBy: "color" });
    expect(h.session.getDiagnostics()).toMatchObject({
      configurations: 3,
      dataRevisions: 1,
    });
    expect(notified).not.toHaveBeenCalled();
    const failure = new Error("failed configuration");
    h.graph.setConfig.mockRejectedValueOnce(failure);
    await expect(h.session.update(data("next"), {})).rejects.toBe(failure);
    expect(h.session.getDiagnostics()).toMatchObject({
      configurations: 3,
      dataRevisions: 1,
    });
    await h.session.dispose();
  });

  it("counts completed point drags with movement but ignores clicks and obsolete callbacks", async () => {
    const h = harness();
    await h.session.update(data(), {});
    const config = h.configurations[0];
    const event = { dx: 12, dy: -4 } as Parameters<NonNullable<CosmographConfig["onDrag"]>>[0];
    config.onDragStart?.(event);
    config.onDragEnd?.(event);
    expect(h.session.getDiagnostics().dragCount).toBe(0);
    config.onDragStart?.(event);
    config.onDrag?.(event);
    config.onDragEnd?.(event);
    expect(h.session.getDiagnostics().dragCount).toBe(1);
    h.session.setActive(false);
    config.onDragStart?.(event);
    config.onDrag?.(event);
    config.onDragEnd?.(event);
    expect(h.session.getDiagnostics().dragCount).toBe(1);
    await h.session.dispose();
    config.onDragStart?.(event);
    config.onDrag?.(event);
    config.onDragEnd?.(event);
    expect(h.session.getDiagnostics().dragCount).toBe(1);
  });

  it("restores the requested paused state after native dragging, including a view hidden during the drag", async () => {
    const h = harness();
    const order: string[] = [];
    h.session.controls(null, true);
    await h.session.update(data(), {
      onDragEnd: () => {
        order.push("callback");
      },
    });
    h.graph.pause.mockImplementation(() => {
      order.push("pause");
    });
    const config = h.configurations[0];
    const event = { dx: 4, dy: 2 } as Parameters<NonNullable<CosmographConfig["onDrag"]>>[0];
    config.onDragStart?.(event);
    config.onDrag?.(event);
    config.onDragEnd?.(event);
    expect(order).toEqual(["callback", "pause"]);
    h.session.controls(null, false);
    h.session.setActive(false);
    order.length = 0;
    config.onDragEnd?.(event);
    expect(order).toEqual(["pause"]);
    await h.session.dispose();
    order.length = 0;
    config.onDragEnd?.(event);
    expect(order).toEqual([]);
  });

  it("outlines and pins the chosen set while inspection and neighbors remain independent", async () => {
    const h = harness();
    const prepared = data();
    h.session.controls("a", true, ["a", "b", "outside", "b"], ["b"]);
    await h.session.update(prepared, { outlinedPointRingColor: "#69d9eb" });
    const first = h.configurations[0];
    expect(first.outlinedPointIndices).toEqual([1]);
    expect(h.session.getDiagnostics().outlinedCount).toBe(1);
    expect(h.graph.setPinnedPoints).toHaveBeenLastCalledWith([1]);
    h.tables.stage.mockClear();
    h.session.controls("b", true, ["a", "b"], ["a"]);
    await vi.waitFor(() => expect(h.graph.setConfig).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(h.configurations.at(-1)!.outlinedPointIndices).toEqual([0]));
    expect(h.configurations.at(-1)).toMatchObject({
      points: first.points,
      links: first.links,
      outlinedPointRingColor: "#69d9eb",
    });
    expect(h.tables.stage).not.toHaveBeenCalled();
    expect(h.session.getDiagnostics().dataRevisions).toBe(1);
    expect(h.graph.setFocusedPoint).toHaveBeenLastCalledWith(1);
    expect(h.graph.setPinnedPoints).toHaveBeenLastCalledWith([0]);
    expect(h.fits).not.toHaveBeenCalled();
    h.session.controls(null, true, []);
    await vi.waitFor(() => expect(h.session.getDiagnostics().outlinedCount).toBe(0));
    expect(h.configurations.at(-1)!.outlinedPointIndices).toEqual([]);
    await h.session.dispose();
  });

  it("retains search accent rings through selection and dimension changes and clears them with the source", async () => {
    const h = harness();
    const prepared = data();
    prepared.config.accentedPointIndices = [0, 1];
    prepared.config.accentedPointRingColor = "#ff4fd8";
    await h.session.update(prepared, { spaceDimensions: 2 });
    expect(h.configurations.at(-1)!.accentedPointIndices).toEqual([0, 1]);
    expect(h.session.getDiagnostics().outlinedCount).toBe(0);
    expect(h.graph.setPinnedPoints).toHaveBeenLastCalledWith([]);
    h.session.controls("a", true, ["a"], ["a"]);
    await vi.waitFor(() => expect(h.session.getDiagnostics().outlinedCount).toBe(1));
    expect(h.configurations.at(-1)).toMatchObject({
      accentedPointIndices: [0, 1],
      outlinedPointIndices: [0],
    });
    expect(h.graph.setPinnedPoints).toHaveBeenLastCalledWith([0]);
    await h.session.update(prepared, { spaceDimensions: 3 });
    expect(h.configurations.at(-1)).toMatchObject({
      spaceDimensions: 3,
      accentedPointIndices: [0, 1],
      accentedPointRingColor: "#ff4fd8",
    });
    h.session.controls(null, true);
    await vi.waitFor(() => expect(h.session.getDiagnostics().outlinedCount).toBe(0));
    expect(h.configurations.at(-1)!.accentedPointIndices).toEqual([0, 1]);
    const ordinary = data("next");
    ordinary.config.accentedPointIndices = [];
    await h.session.update(ordinary, { spaceDimensions: 2 });
    expect(h.configurations.at(-1)!.accentedPointIndices).toEqual([]);
    expect(h.graph.setPinnedPoints).toHaveBeenLastCalledWith([]);
    await h.session.dispose();
  });

  it("applies only the latest chosen outline mask during an earlier visual update", async () => {
    const h = harness();
    await h.session.update(data(), {});
    const started = deferred();
    const finish = deferred();
    const setConfig = h.graph.setConfig.getMockImplementation()!;
    h.graph.setConfig.mockImplementationOnce(async (config) => {
      started.resolve();
      await finish.promise;
      await setConfig(config);
    });
    h.session.controls("a", false, ["a", "b"], ["a"]);
    await started.promise;
    h.session.controls("b", false, ["a", "b"], ["b"]);
    h.session.controls(null, false, []);
    finish.resolve();
    await vi.waitFor(() => expect(h.graph.setConfig).toHaveBeenCalledTimes(3));
    expect(h.configurations.at(-1)!.outlinedPointIndices).toEqual([]);
    expect(h.session.getDiagnostics().dataRevisions).toBe(1);
    expect(h.graph.setFocusedPoint).toHaveBeenLastCalledWith(undefined);
    expect(h.graph.setPinnedPoints).toHaveBeenLastCalledWith([]);
    await h.session.dispose();
  });

  it("fixes all chosen members equally and never pins derived highlights or edge endpoints", async () => {
    const h = harness();
    const prepared = data();
    prepared.idToIndex.set("c", 2);
    prepared.indexToId.push("c");
    prepared.indexToLabel.push("c");
    prepared.pointsCount = 3;
    h.session.controls("c", false, ["a", "b", "c"], ["a", "b", "outside"], ["c"]);
    await h.session.update(prepared, {});
    expect(h.graph.setPinnedPoints).toHaveBeenLastCalledWith([0, 1]);
    expect(h.configurations[0].outlinedPointIndices).toEqual([0, 1]);
    expect(h.session.getDiagnostics()).toMatchObject({
      chosenIds: ["a", "b"],
      pinnedCount: 2,
      inspectedId: "c",
    });
    const pinCalls = h.graph.setPinnedPoints.mock.calls.length;
    h.session.controls("b", false, ["a", "b", "c"], ["outside", "b", "a"], ["c"]);
    expect(h.graph.setPinnedPoints).toHaveBeenCalledTimes(pinCalls);
    expect(h.graph.setFocusedPoint).toHaveBeenLastCalledWith(undefined);
    expect(h.session.getDiagnostics().inspectedId).toBe("b");
    expect(h.configurations.at(-1)!.outlinedPointIndices).toEqual([0, 1]);
    await h.session.dispose();
  });

  it("remaps pins by stable ID after data replacement and does not transfer them to a document representative", async () => {
    const h = harness();
    h.session.controls(null, false, [], ["a"]);
    await h.session.update(data("a"), {});
    expect(h.graph.setPinnedPoints).toHaveBeenLastCalledWith([0]);
    // The owner removes a hidden block from S; the new document representative is a different ID.
    h.session.controls(null, false, [], []);
    await h.session.update(data("document"), {});
    expect(h.graph.setPinnedPoints).toHaveBeenLastCalledWith([]);
    expect(h.session.getDiagnostics().chosenIds).toEqual([]);
    h.session.controls(null, false, [], ["b"]);
    const reordered = data("document");
    reordered.indexToId = ["b", "document"];
    reordered.idToIndex = new Map([
      ["b", 0],
      ["document", 1],
    ]);
    await h.session.update(reordered, {});
    expect(h.graph.setPinnedPoints).toHaveBeenLastCalledWith([0]);
    await h.session.dispose();
  });

  it("rejects stale edge events with the same lifetime rules as node events", async () => {
    const h = harness();
    const click = vi.fn();
    const hover = vi.fn();
    await h.session.update(data("old"), {
      onLinkClick: click,
      onLinkMouseOver: hover,
    });
    const obsolete = h.configurations[0];
    await h.session.update(data("new"), {
      onLinkClick: click,
      onLinkMouseOver: hover,
    });
    obsolete.onLinkClick?.(0, {} as MouseEvent);
    obsolete.onLinkMouseOver?.(0);
    expect(click).not.toHaveBeenCalled();
    expect(hover).not.toHaveBeenCalled();
    h.configurations.at(-1)!.onLinkClick?.(0, {} as MouseEvent);
    expect(click).toHaveBeenCalledTimes(1);
    await h.session.dispose();
  });

  it("counts custom group drags without resuming a paused or hidden renderer", async () => {
    const h = harness();
    h.session.controls(null, true, [], ["a", "b"]);
    await h.session.update(data(), {});
    h.graph.unpause.mockClear();
    h.session.groupDragFinished(true);
    expect(h.session.getDiagnostics().dragCount).toBe(1);
    expect(h.graph.unpause).not.toHaveBeenCalled();
    h.session.setActive(false);
    h.session.groupDragFinished(true);
    expect(h.session.getDiagnostics().dragCount).toBe(1);
    await h.session.dispose();
    h.session.groupDragFinished(true);
    expect(h.session.getDiagnostics().dragCount).toBe(1);
  });
});
