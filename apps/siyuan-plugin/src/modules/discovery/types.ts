export type DiscoveryRule = "shared-targets" | "shared-sources";

export const DISCOVERY_LIMITS = {
  seeds: 128,
  visits: 5_000_000,
  candidates: 100,
  supports: 50,
} as const;

export interface DiscoveryRequest {
  nodes: number;
  endpoints: Uint32Array;
  seeds: number[];
  rule: DiscoveryRule;
  /** Omit for ranking; supply to inspect one candidate's supporting documents. */
  candidate?: number;
}
export interface DiscoveryCandidate {
  node: number;
  score: number;
  bestSeed: number;
  common: number;
  matchedSeeds: number;
}
export interface DiscoveryMatch {
  seed: number;
  score: number;
  common: number;
  supports: number[];
}
export type DiscoveryResult =
  | { kind: "candidates"; candidates: DiscoveryCandidate[]; total: number }
  | { kind: "evidence"; candidate: number; matches: DiscoveryMatch[] };
