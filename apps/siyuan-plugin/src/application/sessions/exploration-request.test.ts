import { describe, expect, it, vi } from "vitest";
import type { GraphEngine, Neighborhood } from "./graph-engine";
import { ExplorationRequest } from "./exploration-request";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const neighborhood = (...indices: number[]): Neighborhood => ({
  indices: Uint32Array.from(indices),
  truncated: false,
});

function engineHarness() {
  const engine: GraphEngine = {
    load: vi.fn(),
    neighborhood: vi.fn(),
    shortestPath: vi.fn(),
    distances: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    engine,
    neighbors: vi.mocked(engine.neighborhood),
    paths: vi.mocked(engine.shortestPath),
  };
}

describe("exploration requests within one topology revision", () => {
  it("discards an old depth response after the latest neighborhood has completed", async () => {
    const { engine, neighbors } = engineHarness();
    const old = deferred<Neighborhood>();
    const latest = deferred<Neighborhood>();
    neighbors.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const queries = new ExplorationRequest();
    const first = queries.neighborhood(engine, [2], "out", 1);
    const second = queries.neighborhood(engine, [2], "out", 3);
    const expected = neighborhood(2, 3, 4, 5);
    latest.resolve(expected);
    await expect(second).resolves.toBe(expected);
    old.resolve(neighborhood(2, 3));
    await expect(first).resolves.toBeNull();
    expect(neighbors.mock.calls).toEqual([
      [[2], "out", 1, 10_000],
      [[2], "out", 3, 10_000],
    ]);
    expect(engine.load).not.toHaveBeenCalled();
  });

  it("invalidates old direction and chosen-set responses as soon as a replacement starts", async () => {
    const { engine, neighbors } = engineHarness();
    const old = deferred<Neighborhood>();
    const latest = deferred<Neighborhood>();
    neighbors.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const queries = new ExplorationRequest();
    const first = queries.neighborhood(engine, [1, 2], "out", 2);
    const second = queries.neighborhood(engine, [4, 5], "in", 2);
    old.resolve(neighborhood(1, 2, 3));
    await expect(first).resolves.toBeNull();
    const expected = neighborhood(4, 5, 6);
    latest.resolve(expected);
    await expect(second).resolves.toBe(expected);
    expect(neighbors).toHaveBeenLastCalledWith([4, 5], "in", 2, 10_000);
  });

  it("prevents an obsolete path from overwriting a newer neighborhood", async () => {
    const { engine, neighbors, paths } = engineHarness();
    const old = deferred<Uint32Array>();
    const latest = deferred<Neighborhood>();
    paths.mockReturnValueOnce(old.promise);
    neighbors.mockReturnValueOnce(latest.promise);
    const queries = new ExplorationRequest();
    const first = queries.path(engine, 0, 8, "out");
    const second = queries.neighborhood(engine, [2, 3], "both", 1);
    const expected = neighborhood(2, 3, 9);
    latest.resolve(expected);
    await expect(second).resolves.toBe(expected);
    old.resolve(Uint32Array.of(0, 1, 8));
    await expect(first).resolves.toBeNull();
  });

  it("prevents an obsolete neighborhood from overwriting a newer path", async () => {
    const { engine, neighbors, paths } = engineHarness();
    const old = deferred<Neighborhood>();
    const latest = deferred<Uint32Array>();
    neighbors.mockReturnValueOnce(old.promise);
    paths.mockReturnValueOnce(latest.promise);
    const queries = new ExplorationRequest();
    const first = queries.neighborhood(engine, [1], "out", 5);
    const second = queries.path(engine, 7, 9, "in");
    const expected = Uint32Array.of(7, 8, 9);
    latest.resolve(expected);
    await expect(second).resolves.toBe(expected);
    old.resolve(neighborhood(1, 2, 3, 4, 5));
    await expect(first).resolves.toBeNull();
    expect(paths).toHaveBeenCalledWith(7, 9, "in");
  });

  it("invalidates pending work when choices are cleared without starting another query", async () => {
    const { engine, neighbors, paths } = engineHarness();
    const waitingNeighborhood = deferred<Neighborhood>();
    const waitingPath = deferred<Uint32Array>();
    neighbors.mockReturnValueOnce(waitingNeighborhood.promise);
    paths.mockReturnValueOnce(waitingPath.promise);
    const queries = new ExplorationRequest();
    const first = queries.neighborhood(engine, [2], "both", 3);
    queries.cancel();
    waitingNeighborhood.resolve(neighborhood(2, 3));
    await expect(first).resolves.toBeNull();
    const second = queries.path(engine, 3, 9, "out");
    queries.cancel();
    waitingPath.resolve(Uint32Array.of(3, 9));
    await expect(second).resolves.toBeNull();
  });

  it("keeps room for all equal chosen origins even when S exceeds the normal result budget", async () => {
    const { engine, neighbors } = engineHarness();
    const seeds = Array.from({ length: 10_001 }, (_, index) => index);
    const expected = neighborhood(...seeds);
    neighbors.mockResolvedValueOnce(expected);
    const queries = new ExplorationRequest();
    await expect(queries.neighborhood(engine, seeds, "both", 0)).resolves.toBe(expected);
    expect(neighbors).toHaveBeenCalledWith(seeds, "both", 0, 10_001);
  });

  it("propagates failure of the currently owned request", async () => {
    const { engine, neighbors } = engineHarness();
    neighbors.mockRejectedValueOnce(new Error("Graph worker failed"));
    await expect(new ExplorationRequest().neighborhood(engine, [0], "out", 1)).rejects.toThrow(
      "Graph worker failed",
    );
  });

  it("suppresses an obsolete neighborhood rejection after a newer result is available", async () => {
    const { engine, neighbors } = engineHarness();
    const old = deferred<Neighborhood>();
    const latest = neighborhood(8, 9);
    neighbors.mockReturnValueOnce(old.promise).mockResolvedValueOnce(latest);
    const queries = new ExplorationRequest();
    const first = queries.neighborhood(engine, [1], "out", 1);
    await expect(queries.neighborhood(engine, [8], "in", 2)).resolves.toBe(latest);
    const obsolete = expect(first).resolves.toBeNull();
    old.reject(new Error("The old graph snapshot was replaced"));
    await obsolete;
  });

  it("suppresses an obsolete path rejection instead of replacing a newer neighborhood with an error", async () => {
    const { engine, neighbors, paths } = engineHarness();
    const old = deferred<Uint32Array>();
    const latest = neighborhood(4, 5);
    paths.mockReturnValueOnce(old.promise);
    neighbors.mockResolvedValueOnce(latest);
    const queries = new ExplorationRequest();
    const first = queries.path(engine, 0, 2, "out");
    await expect(queries.neighborhood(engine, [4], "both", 1)).resolves.toBe(latest);
    const obsolete = expect(first).resolves.toBeNull();
    old.reject(new Error("The old graph snapshot was replaced"));
    await obsolete;
  });

  it("propagates failure of the currently owned path", async () => {
    const { engine, paths } = engineHarness();
    paths.mockRejectedValueOnce(new Error("Path computation failed"));
    await expect(new ExplorationRequest().path(engine, 0, 1, "out")).rejects.toThrow(
      "Path computation failed",
    );
  });
});
