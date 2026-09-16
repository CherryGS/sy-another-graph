import type { CurrentGraph } from "../../core/scope/graph-model";

export type SearchOrigin = "match" | "projected-match" | "ancestor";
export interface SearchOrigins {
  /** Visible identities that are themselves admitted original search hits. */
  matches: ReadonlySet<string>;
  /** Visible representatives and the number of hidden original hits they carry. */
  projected: ReadonlyMap<string, number>;
}
export const SEARCH_MATCH_RING_COLOR = "#ff4fd8";
export const SEARCH_ORIGIN_LABELS: Record<SearchOrigin, string> = {
  match: "直接命中",
  "projected-match": "命中投影",
  ancestor: "上级节点",
};

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

export function searchOriginDescription(id: string, origins?: SearchOrigins): string | undefined {
  const origin = searchNodeOrigin(id, origins);
  if (!origin) return undefined;
  const count = origins?.projected.get(id) ?? 0;
  if (origin === "ancestor") return "上级节点：为补齐搜索结果的祖先链加入。";
  if (origin === "projected-match")
    return `命中投影：${count} 个隐藏的命中块由此文档表示；该文档本身未直接命中当前搜索范围。`;
  return count ? `直接命中搜索，同时承载 ${count} 个隐藏命中块。` : "直接命中：来自原始搜索结果。";
}
