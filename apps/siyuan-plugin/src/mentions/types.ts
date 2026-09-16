import type { GraphEdge } from "../data/types";

export type MentionMode = "off" | "selected" | "all";

/** Native source material is private to acquisition/indexing, not exported nodes. */
export interface MentionBlock {
  id: string;
  rootId: string;
  type: string;
  title: string;
  ial: string;
  markdown: string | null;
}

export interface MentionEvidence {
  keyword: string;
  matched: string;
  excerpt: string;
  /** UTF-16 offsets within the displayed ordinary-prose excerpt. */
  start: number;
  end: number;
  candidates: number;
}

export interface MentionScopeEntry {
  id: string;
  displayId: string;
  index: number;
}

export interface MentionScope {
  entries: MentionScopeEntry[];
  explicitPairs: readonly (readonly [number, number])[];
}

export interface MentionProgress {
  scanned: number;
  total: number;
  cached: number;
  keywords: number;
  skippedKeywords: number;
  skippedSources: number;
  limitedSources: number;
}

export interface MentionResult {
  edges: GraphEdge[];
  truncated: boolean;
  ambiguousEdges: number;
}

export const EMPTY_MENTION_PROGRESS: MentionProgress = {
  scanned: 0,
  total: 0,
  cached: 0,
  keywords: 0,
  skippedKeywords: 0,
  skippedSources: 0,
  limitedSources: 0,
};

export const MENTION_LIMITS = {
  keywords: 50_000,
  keywordCharacters: 1_000_000,
  sourceCharacters: 250_000,
  termsPerSource: 256,
  occurrencesPerSource: 4_096,
  cachedOccurrences: 1_000_000,
  edges: 100_000,
  provenancePerEdge: 64,
} as const;
export type MentionLimits = { [Key in keyof typeof MENTION_LIMITS]: number };

export function isMentionMode(value: unknown): value is MentionMode {
  return value === "off" || value === "selected" || value === "all";
}
