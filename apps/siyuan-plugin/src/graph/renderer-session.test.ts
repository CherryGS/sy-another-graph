import { describe, expect, it, vi } from "vitest";
import type { CosmographConfig } from "@cosmograph/cosmograph";
import type { PreparedGraph } from "./prepare-graph";
import type { UploadedGraph } from "./graph-tables";
import { RendererSession, type FrameScheduler } from "./renderer-session";

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
    indexToId: [id, "b"],
    indexToLabel: [id, "b"],
    idToIndex: new Map([
      [id, 0],
      ["b", 1],
    ]),
    pointsCount: 2,
    linksCount,
    preparationMs: 0,
  };
}

function harness() {
  const order: string[] = [];
  const records = new Map<string, PreparedGraph>();
  const configurations: CosmographConfig[] = [];
  const timers = new Map<number, () => void>();
  const frames = new Map<number, () => void>();
  let sequence = 0;
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
    stats: { pointsCount: 0, linksCount: 0 },
    setConfig: vi.fn(async (config: CosmographConfig) => {
      configurations.push(config);
      const prepared = records.get(String(config.points));
      graph.stats = {
        pointsCount: prepared?.pointsCount ?? 0,
        linksCount: prepared?.linksCount ?? 0,
      };
      order.push("configured");
    }),
    reset: vi.fn(async () => {
      graph.stats = { pointsCount: 0, linksCount: 0 };
      order.push("reset");
    }),
    destroy: vi.fn(async () => {
      order.push("destroy");
    }),
    pause: vi.fn(),
    unpause: vi.fn(),
    selectPoints: vi.fn(),
    setFocusedPoint: vi.fn(),
    fitView: vi.fn(),
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
  const session = new RendererSession(
    graph,
    tables,
    drain,
    close,
    failure,
    scheduler,
  );
  return {
    session,
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

describe("renderer lifetime", () => {
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
    h.session.controls("b", true);
    h.session.fit();
    expect(h.graph.pause).not.toHaveBeenCalled();
    expect(h.graph.selectPoints).not.toHaveBeenCalled();
    expect(h.graph.fitView).not.toHaveBeenCalled();
    const closing = h.session.dispose();
    expect(h.graph.destroy).not.toHaveBeenCalled();
    finish.resolve();
    expect(await update).toBeNull();
    await closing;
    expect(h.order.indexOf("rebuild-finished")).toBeLessThan(
      h.order.indexOf("destroy"),
    );
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
    expect(h.graph.fitView).not.toHaveBeenCalled();
    await h.session.dispose();
    timer();
    frame();
    expect(h.graph.fitView).not.toHaveBeenCalled();
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
    expect(h.graph.selectPoints).toHaveBeenCalledExactlyOnceWith(
      [1],
      false,
      true,
    );
    expect(h.graph.pause).toHaveBeenCalledTimes(1);
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
    expect(h.graph.fitView).not.toHaveBeenCalled();
    expect(h.graph.selectPoints).not.toHaveBeenCalled();
    await h.session.dispose();
  });

  it("retains a defined links table through linked, zero-link, and linked updates", async () => {
    const h = harness();
    await h.session.update(data("one", 1), {});
    await h.session.update(data("two", 0), {});
    await h.session.update(data("three", 2), {});
    expect(
      h.configurations.every((config) => typeof config.links === "string"),
    ).toBe(true);
    expect(
      h.configurations.every((config) => config.fitViewOnInit === false),
    ).toBe(true);
    expect(h.session.counts).toEqual({ nodes: 2, links: 2 });
    await h.session.dispose();
  });
});
