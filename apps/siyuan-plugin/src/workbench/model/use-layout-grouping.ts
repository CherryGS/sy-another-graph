import { useMemo } from "react";
import type { GraphLike } from "../../core/graph/graph-lookups";
import type { GraphNode } from "../../core/graph/types";
import { useCommunities } from "../../modules/communities/use-communities";
import { useSetMembership } from "../../modules/layout-groups/use-set-membership";
import type { LayoutGrouping } from "../../modules/layout-groups/model";
import type { GraphGrouping } from "../presentation/types";

export function useLayoutGrouping(
  graph: GraphLike | null,
  nodes: readonly GraphNode[],
  rules: LayoutGrouping,
  sourceData: GraphLike | null,
) {
  const communities = useCommunities(graph, rules.mode === "community", rules.resolution);
  const sets = useSetMembership(nodes, rules.sets, rules.mode === "sets", sourceData);
  const setGraph = useMemo(() => ({ nodes, edges: [] }), [nodes]);
  const partition =
    rules.mode === "sets"
      ? sets.result
      : rules.mode === "community"
        ? communities.partition
        : undefined;
  const source = rules.mode === "sets" ? setGraph : (communities.graph ?? null);
  const pending =
    rules.mode === "sets" ? sets.pending : rules.mode === "community" && communities.pending;
  const error =
    rules.mode === "sets" ? sets.error : rules.mode === "community" ? communities.error : undefined;
  const presentation = useMemo<GraphGrouping>(
    () => ({
      mode: rules.mode,
      strength: rules.strength,
      resolution: rules.resolution,
      background: rules.background,
      graph: source,
      partition,
      pending,
      error,
    }),
    [
      rules.mode,
      rules.strength,
      rules.resolution,
      rules.background,
      source,
      partition,
      pending,
      error,
    ],
  );
  return { presentation, sets: sets.result, retry: sets.retry };
}
