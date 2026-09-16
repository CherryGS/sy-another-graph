import type { CurrentGraph } from "../../core/scope/graph-model";

export type SearchOrigin = "match" | "projected-match" | "ancestor";
export interface SearchOrigins {
  /** Visible identities that are themselves admitted original search hits. */
  matches: ReadonlySet<string>;
  /** Visible representatives and the number of hidden original hits they carry. */
  projected: ReadonlyMap<string, number>;
}

/** Search identity follows original source IDs, never title text or chosen state.
 * Keep only admitted hits so excluded sources cannot mark a surviving ancestor. */
export function buildSearchOrigins(
  graph: CurrentGraph,
  matchedIds: ReadonlySet<string>,
): SearchOrigins {
  const matches = new Set<string>();
  const projected = new Map<string, number>();
  for (const id of matchedIds) {
    if (!graph.sourceIds.has(id)) continue;
    const representative = graph.representatives.get(id);
    if (!representative || !graph.eligibleIds.has(representative)) continue;
    if (representative === id) matches.add(id);
    else projected.set(representative, (projected.get(representative) ?? 0) + 1);
  }
  return { matches, projected };
}

export function searchNodeOrigin(id: string, origins?: SearchOrigins): SearchOrigin | undefined {
  if (!origins) return undefined;
  return origins.matches.has(id)
    ? "match"
    : origins.projected.has(id)
      ? "projected-match"
      : "ancestor";
}
