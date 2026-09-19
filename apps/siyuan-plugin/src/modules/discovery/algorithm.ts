import { MessageError, message } from "../../core/diagnostics/message";
import {
  DISCOVERY_LIMITS,
  type DiscoveryRequest,
  type DiscoveryResult,
  type DiscoveryMatch,
} from "./types";

interface Adjacency {
  offsets: Uint32Array;
  neighbors: Uint32Array;
}
function adjacency(nodes: number, endpoints: Uint32Array, reverse: boolean): Adjacency {
  const offsets = new Uint32Array(nodes + 1);
  for (let i = 0; i < endpoints.length; i += 2) offsets[endpoints[i + Number(reverse)] + 1]++;
  for (let i = 1; i <= nodes; i++) offsets[i] += offsets[i - 1];
  const cursors = offsets.slice();
  const neighbors = new Uint32Array(endpoints.length / 2);
  for (let i = 0; i < endpoints.length; i += 2)
    neighbors[cursors[endpoints[i + Number(reverse)]]++] = endpoints[i + Number(!reverse)];
  return { offsets, neighbors };
}
const degree = (graph: Adjacency, node: number) => graph.offsets[node + 1] - graph.offsets[node];
const row = (graph: Adjacency, node: number) =>
  graph.neighbors.subarray(graph.offsets[node], graph.offsets[node + 1]);

/** Reference pairs are deduplicated before this numeric-only Worker boundary. */
export function discover(
  request: DiscoveryRequest,
  budget: number = DISCOVERY_LIMITS.visits,
): DiscoveryResult {
  const { nodes, endpoints, rule } = request;
  const valid = (node: number) => Number.isInteger(node) && node >= 0 && node < nodes;
  if (
    !Number.isSafeInteger(nodes) ||
    nodes < 0 ||
    !(endpoints instanceof Uint32Array) ||
    endpoints.length % 2 ||
    endpoints.some((node) => !valid(node)) ||
    !["shared-targets", "shared-sources"].includes(rule)
  )
    throw new Error("Invalid reference discovery topology");
  const seeds = [...new Set(request.seeds)].sort((a, b) => a - b);
  if (seeds.length > DISCOVERY_LIMITS.seeds)
    throw new MessageError(message("discovery.tooManySeeds", { count: DISCOVERY_LIMITS.seeds }));
  if (
    seeds.some((seed) => !valid(seed)) ||
    (request.candidate !== undefined && !valid(request.candidate))
  )
    throw new Error("Invalid discovery node");
  const outward = adjacency(nodes, endpoints, false),
    inward = adjacency(nodes, endpoints, true);
  const neighbors = rule === "shared-targets" ? outward : inward;
  const postings = rule === "shared-targets" ? inward : outward;
  const weights = Float64Array.from(
    { length: nodes },
    (_, node) => 1 / Math.log2(2 + degree(postings, node)),
  );
  const totals = new Float64Array(nodes);
  for (let node = 0; node < nodes; node++)
    for (const support of row(neighbors, node)) totals[node] += weights[support];
  const score = (a: number, b: number, common: number) =>
    Math.min(1, common / (totals[a] + totals[b] - common));
  let visits = 0;
  const spend = (count: number) => {
    visits += count;
    if (visits > budget) throw new MessageError(message("discovery.budget"));
  };
  if (request.candidate !== undefined) {
    const candidate = request.candidate;
    const candidateSupports = new Set(row(neighbors, candidate));
    const matches: DiscoveryMatch[] = [];
    for (const seed of seeds) {
      spend(degree(neighbors, seed));
      const common = [...row(neighbors, seed)].filter((support) => candidateSupports.has(support));
      if (!common.length) continue;
      const overlap = common.reduce((sum, support) => sum + weights[support], 0);
      common.sort((a, b) => weights[b] - weights[a] || a - b);
      matches.push({
        seed,
        score: score(seed, candidate, overlap),
        common: common.length,
        supports: common.slice(0, DISCOVERY_LIMITS.supports),
      });
    }
    matches.sort((a, b) => b.score - a.score || b.common - a.common || a.seed - b.seed);
    return { kind: "evidence", candidate, matches };
  }
  // Preflight rejects an oversized query before returning misleading partial scores.
  for (const seed of seeds)
    for (const support of row(neighbors, seed)) spend(degree(postings, support));
  const chosen = new Set(seeds);
  const counts = new Uint32Array(nodes),
    overlap = new Float64Array(nodes);
  const best = new Float64Array(nodes),
    bestSeed = new Uint32Array(nodes),
    bestCommon = new Uint32Array(nodes),
    matched = new Uint32Array(nodes);
  for (const seed of seeds) {
    const touched: number[] = [];
    for (const support of row(neighbors, seed))
      for (const candidate of row(postings, support)) {
        if (chosen.has(candidate)) continue;
        if (!counts[candidate]) touched.push(candidate);
        counts[candidate]++;
        overlap[candidate] += weights[support];
      }
    for (const candidate of touched) {
      const value = score(seed, candidate, overlap[candidate]);
      if (
        !matched[candidate] ||
        value > best[candidate] ||
        (value === best[candidate] && counts[candidate] > bestCommon[candidate])
      ) {
        best[candidate] = value;
        bestSeed[candidate] = seed;
        bestCommon[candidate] = counts[candidate];
      }
      matched[candidate]++;
      counts[candidate] = 0;
      overlap[candidate] = 0;
    }
  }
  const candidates = [];
  for (let node = 0; node < nodes; node++)
    if (matched[node])
      candidates.push({
        node,
        score: best[node],
        bestSeed: bestSeed[node],
        common: bestCommon[node],
        matchedSeeds: matched[node],
      });
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      b.matchedSeeds - a.matchedSeeds ||
      b.common - a.common ||
      a.node - b.node,
  );
  return {
    kind: "candidates",
    total: candidates.length,
    candidates: candidates.slice(0, DISCOVERY_LIMITS.candidates),
  };
}
