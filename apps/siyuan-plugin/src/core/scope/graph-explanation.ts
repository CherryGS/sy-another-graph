import { message, type Message } from "../diagnostics/message";
import { getGraphLookups } from "../graph/graph-lookups";
import type { GraphDataset, GraphEdgeKind, GraphNode } from "../graph/types";
import type { CurrentGraph, GraphView } from "./graph-model";
import { displayRepresentative, projectionContext, sourceRejection } from "./source-eligibility";

export interface NodeExplanation {
  node?: GraphNode;
  representative?: GraphNode;
  steps: { stage: "source" | "scope" | "projection" | "display"; message: Message }[];
}

export function explainNode(
  data: GraphDataset,
  graph: CurrentGraph,
  view: GraphView,
  backgroundIds: ReadonlySet<string>,
  id: string,
): NodeExplanation {
  const byId = getGraphLookups(data).byId;
  const node = byId.get(id);
  const result: NodeExplanation = { node, steps: [] };
  const add = (
    stage: NodeExplanation["steps"][number]["stage"],
    code: string,
    params?: Message["params"],
  ) => {
    result.steps.push({ stage, message: message(code, params) });
  };
  if (!node) {
    add("source", "graph.traceMissingSource");
    return result;
  }
  add("source", "graph.traceSourcePresent");
  const context = projectionContext(graph.sourceIds, data);
  if (!context) {
    add("scope", "graph.traceUnavailable");
    return result;
  }
  const rejection = sourceRejection(node, context.boundary, byId);
  if (!graph.sourceIds.has(id)) {
    add("scope", rejection ?? "graph.traceDatabaseDisconnected");
    if (!graph.eligibleIds.has(id)) return result;
    // A displayed document can represent eligible children without importing
    // its own source facts into the scope.
    add("projection", "graph.traceRepresentativeOnly");
    result.representative = node;
  } else {
    add("scope", "graph.traceScopeAccepted");
    const representative = displayRepresentative(node, context.rules, context.boundary, byId);
    if (!representative) {
      add("projection", "graph.traceHiddenWithoutRepresentative");
      return result;
    }
    result.representative = representative;
    add(
      "projection",
      representative.id === node.id ? "graph.traceOwnNode" : "graph.traceProjected",
      {
        name: representative.label,
        id: representative.id,
      },
    );
  }
  const displayId = result.representative!.id;
  add(
    "display",
    getGraphLookups(view).byId.has(displayId)
      ? "graph.traceVisible"
      : !backgroundIds.has(displayId)
        ? "graph.traceOutsideDisplay"
        : "graph.traceIsolatedHidden",
  );
  return result;
}

export interface RelationExplanation {
  original: { kind: GraphEdgeKind; count: number; reason: Message }[];
  displayed: { kind: GraphEdgeKind; count: number; weight: number }[];
}

/** Direct source facts and projected connections are reported separately. */
export function explainRelation(
  data: GraphDataset,
  graph: CurrentGraph,
  fromId: string,
  toId: string,
): RelationExplanation {
  const result: RelationExplanation = { original: [], displayed: [] };
  const context = projectionContext(graph.sourceIds, data);
  if (!context) return result;
  const source = getGraphLookups(data);
  const from = source.byId.get(fromId),
    to = source.byId.get(toId);
  if (!from || !to) return result;
  const current = getGraphLookups(graph);
  const displayFrom = current.byId.get(graph.representatives.get(fromId) ?? "");
  const displayTo = current.byId.get(graph.representatives.get(toId) ?? "");
  if (displayFrom && displayTo) {
    for (const edge of current.incidentEdges(displayFrom.index)) {
      if (edge.source !== displayFrom.index || edge.target !== displayTo.index) continue;
      const row = result.displayed.find((item) => item.kind === edge.kind);
      if (row) {
        row.count++;
        row.weight += edge.weight;
      } else result.displayed.push({ kind: edge.kind, count: 1, weight: edge.weight });
    }
  }
  for (const edge of source.incidentEdges(from.index)) {
    if (edge.source !== from.index || edge.target !== to.index) continue;
    const existing = result.original.find((item) => item.kind === edge.kind);
    if (existing) {
      existing.count++;
      continue;
    }
    const enabled =
      edge.kind === "reference"
        ? context.rules.references
        : edge.kind === "hierarchy"
          ? context.rules.hierarchy
          : context.rules.databases;
    const reason =
      !graph.sourceIds.has(fromId) || !graph.sourceIds.has(toId)
        ? "graph.traceRelationSourceExcluded"
        : !enabled
          ? "graph.traceRelationDisabled"
          : !displayFrom || !displayTo
            ? "graph.traceRelationNoRepresentative"
            : edge.kind === "hierarchy"
              ? "graph.traceHierarchyRebuilt"
              : "graph.traceRelationIncluded";
    result.original.push({ kind: edge.kind, count: 1, reason: message(reason) });
  }
  return result;
}
