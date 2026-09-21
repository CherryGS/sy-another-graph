import type { GraphLike } from "../../core/graph/graph-lookups";
import type { GraphDataset } from "../../core/graph/types";
import { projectGraph } from "../../core/scope/graph-model";
import { isBlock, nodeType } from "../../core/scope/filter-types";
import { matchContentExclusions, type ContentExclusionResult } from "./matcher";
import { removableEmptyDocuments } from "./empty-forest";
import type { ExclusionContext, ExclusionStep } from "./pipeline-model";
import type { ContentExclusionRule } from "./rules";

export interface ExclusionImpact {
  kind: ExclusionStep;
  enabled: boolean;
  matchedIds: string[];
  previousIds: string[];
  removedIds: string[];
  retainedIds: string[];
}

/** Node exclusions run before derived mentions. Each stage sees earlier removals.
 * Counts describe projected nodes in the current scope, before hide-isolated. */
export function runExclusionPipeline(
  source: GraphLike,
  rules: readonly ContentExclusionRule[],
  context: ExclusionContext,
): ContentExclusionResult {
  const data: GraphDataset = {
    ...source,
    nodes: [...source.nodes],
    edges: [...source.edges],
    notebooks: [],
    source: "siyuan",
    loadedAt: "",
    loadMs: 0,
    referenceCount: 0,
    skippedReferences: 0,
    warnings: [],
  };
  const projection = { ...context.projection, excludeIds: [] };
  const searchIds = context.searchIds ? new Set(context.searchIds) : undefined;
  const excluded = new Set<string>();
  const initial = projectGraph(data, projection, searchIds, excluded);
  let current = initial;
  const steps: ExclusionImpact[] = [];
  for (const kind of context.pipeline.order) {
    const impact: ExclusionImpact = {
      kind,
      enabled: context.pipeline.enabled[kind],
      matchedIds: [],
      previousIds: [],
      removedIds: [],
      retainedIds: [],
    };
    steps.push(impact);
    if (!impact.enabled) continue;
    const hits = new Set(
      kind === "empty"
        ? initial.nodes
            .filter((node) => nodeType(node) === "d" && node.emptyDocument === true)
            .map((node) => node.id)
        : matchContentExclusions(
            data,
            rules.filter((rule) => rule.scope === kind),
          ).ids,
    );
    if (!hits.size) continue;
    const matched = new Set(
      initial.nodes.filter((node) => hits.has(node.id)).map((node) => node.id),
    );
    impact.previousIds = [...matched].filter((id) => !current.eligibleIds.has(id));
    let remove = hits;
    if (kind === "empty") {
      const candidates = new Set([...hits].filter((id) => current.eligibleIds.has(id)));
      // Logical entities need native admission anchors after source projection.
      // Keep those anchors as terminals so pruning cannot indirectly delete a
      // nonempty database/item that was a terminal in the spanning forest.
      const prunable = new Set(candidates);
      if (context.pipeline.preserveConnections) {
        const byIndex = new Map(current.nodes.map((node) => [node.index, node]));
        for (const node of current.nodes)
          if (!isBlock(node) && node.boundBlockId) prunable.delete(node.boundBlockId);
        for (const edge of current.edges)
          if (edge.kind.startsWith("database-")) {
            const from = byIndex.get(edge.source),
              to = byIndex.get(edge.target);
            if (from && to) {
              if (!isBlock(from)) prunable.delete(to.id);
              if (!isBlock(to)) prunable.delete(from.id);
            }
          }
      }
      remove = context.pipeline.preserveConnections
        ? removableEmptyDocuments(
            current,
            candidates,
            new Set([...candidates].filter((id) => !prunable.has(id))),
          )
        : candidates;
      impact.retainedIds = [...candidates].filter((id) => !remove.has(id));
    }
    for (const id of remove) excluded.add(id);
    const next = projectGraph(data, projection, searchIds, excluded);
    impact.removedIds = current.nodes
      .filter((node) => !next.eligibleIds.has(node.id))
      .map((node) => node.id);
    // Include indirect removals, such as database entities losing their last admitted source.
    for (const id of impact.removedIds) matched.add(id);
    impact.matchedIds = [...matched];
    current = next;
  }
  const removed = initial.nodes.filter((node) => !current.eligibleIds.has(node.id));
  const documents = removed.filter((node) => nodeType(node) === "d").length;
  return {
    ids: [...excluded],
    matchedRoots: steps.reduce((sum, step) => sum + step.matchedIds.length, 0),
    documents,
    blocks: removed.length - documents,
    steps,
  };
}
