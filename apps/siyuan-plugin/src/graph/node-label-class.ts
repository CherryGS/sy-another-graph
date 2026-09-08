import type { PreparedGraph } from "./prepare-graph";

/** Resolve provenance against the currently displayed stable ID without changing source text. */
export function nodeLabelClass(
  displayed: Pick<PreparedGraph, "idToIndex" | "indexToNode"> | null | undefined,
  id: string | undefined,
  persistent: boolean,
): string {
  let className = persistent ? "ag-graph-label ag-graph-label--chosen" : "ag-graph-label";
  const index = id ? displayed?.idToIndex.get(id) : undefined;
  if (index !== undefined && displayed?.indexToNode[index]?.external)
    className += " ag-graph-label--external";
  return className;
}
