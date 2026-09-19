import { describe, expect, it } from "vitest";
import { discover } from "./algorithm";
import { DISCOVERY_LIMITS, type DiscoveryRequest } from "./types";

const request = (
  pairs: number[],
  seeds = [0],
  rule: DiscoveryRequest["rule"] = "shared-targets",
  nodes = 7,
): DiscoveryRequest => ({ nodes, endpoints: new Uint32Array(pairs), seeds, rule });
function ranked(input: DiscoveryRequest) {
  const result = discover(input);
  if (result.kind !== "candidates") throw new Error("Expected ranking");
  return result;
}

describe("reference relationship discovery", () => {
  it("distinguishes shared targets from shared sources and excludes the chosen documents", () => {
    const pairs = [0, 3, 0, 4, 1, 3, 1, 4, 2, 3, 5, 0, 5, 6];
    const result = ranked(request(pairs));
    expect(result.total).toBe(2);
    expect(result.candidates[0]).toMatchObject({
      node: 1,
      score: 1,
      bestSeed: 0,
      common: 2,
      matchedSeeds: 1,
    });
    expect(result.candidates[1].node).toBe(2);
    const detail = discover({ ...request(pairs), candidate: 1 });
    expect(detail).toMatchObject({
      kind: "evidence",
      candidate: 1,
      matches: [{ seed: 0, common: 2, score: 1, supports: [4, 3] }],
    });
    expect(ranked(request(pairs, [0], "shared-sources")).candidates).toEqual([
      { node: 6, bestSeed: 0, common: 1, matchedSeeds: 1, score: 1 },
    ]);
    expect(ranked(request(pairs, [0, 1])).candidates.map((item) => item.node)).not.toContain(1);
  });
  it("uses overlap proportion and discounts ubiquitous supporting documents", () => {
    // 0 shares the same number of references with 1 and 2. The support for 2
    // is rarer; candidate 3 has additional unmatched references.
    const pairs = [0, 5, 0, 6, 1, 5, 2, 6, 3, 6, 3, 7, 3, 8, 4, 5, 7, 5, 8, 5];
    const result = ranked(request(pairs, [0], "shared-targets", 9));
    expect(result.candidates.findIndex((item) => item.node === 2)).toBeLessThan(
      result.candidates.findIndex((item) => item.node === 1),
    );
    expect(result.candidates.find((item) => item.node === 2)!.score).toBeGreaterThan(
      result.candidates.find((item) => item.node === 3)!.score,
    );
  });
  it("keeps multi-origin evidence separate and ranking independent of selection order", () => {
    const pairs = [0, 4, 0, 5, 1, 5, 1, 6, 2, 4, 2, 5, 2, 6, 3, 6];
    const input = request(pairs, [0, 1]);
    expect(ranked(input)).toEqual(ranked({ ...input, seeds: [1, 0, 0] }));
    expect(ranked(input).candidates.find((item) => item.node === 2)).toMatchObject({
      matchedSeeds: 2,
      common: 2,
    });
    const details = discover({ ...input, candidate: 2 });
    expect(
      details.kind === "evidence" && details.matches.map((match) => match.seed).sort(),
    ).toEqual([0, 1]);
    if (details.kind !== "evidence") throw new Error("Expected evidence");
    expect(details.matches.find((match) => match.seed === 0)?.supports.sort()).toEqual([4, 5]);
    expect(details.matches.find((match) => match.seed === 1)?.supports.sort()).toEqual([5, 6]);
  });
  it("reports exact candidate/support totals while bounding returned detail", () => {
    const pairs: number[] = [];
    for (let node = 0; node < 202; node++) pairs.push(node, 202);
    const result = ranked(request(pairs, [0], "shared-targets", 203));
    expect(result.total).toBe(201);
    expect(result.candidates).toHaveLength(100);
    const shared: number[] = [];
    for (let support = 2; support < 80; support++) shared.push(0, support, 1, support);
    const detail = discover({ ...request(shared, [0], "shared-targets", 80), candidate: 1 });
    expect(detail).toMatchObject({ kind: "evidence", matches: [{ common: 78, score: 1 }] });
    if (detail.kind === "evidence")
      expect(detail.matches[0].supports).toHaveLength(DISCOVERY_LIMITS.supports);
  });
  it("fails a budgeted query instead of publishing partial scores, and handles empty or invalid inputs", () => {
    expect(() => discover(request([0, 2, 1, 2]), 1)).toThrow("discovery.budget");
    expect(() =>
      discover(
        request(
          [],
          Array.from({ length: 129 }, (_, i) => i),
          "shared-targets",
          130,
        ),
      ),
    ).toThrow("discovery.tooManySeeds");
    expect(ranked(request([], [], "shared-sources", 0))).toEqual({
      kind: "candidates",
      total: 0,
      candidates: [],
    });
    expect(() => discover(request([0, 99]))).toThrow(/topology/);
    expect(() => discover({ ...request([]), candidate: -1 })).toThrow(/node/);
  });
  it("handles a sparse 100k-document graph without constructing all-pairs similarity", () => {
    const pairs: number[] = [];
    for (let i = 0; i < 100_000; i++) pairs.push(i, (i + 1) % 100_000);
    pairs.push(50_000, 1);
    expect(ranked(request(pairs, [0], "shared-targets", 100_000)).candidates).toMatchObject([
      { node: 50_000, common: 1 },
    ]);
  });
});
