import type { GraphDirection } from "./graph-engine";

export type ExplorationSummary =
  | { kind: "neighborhood"; depth: number; direction: GraphDirection; truncated: boolean }
  | { kind: "path"; steps: number };

export function hasExplorationNotice(result: ExplorationSummary | null | undefined): boolean {
  return !!result && (result.kind === "path" || result.truncated);
}
