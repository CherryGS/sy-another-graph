import type { GraphDataset, GraphNode } from "../graph/types";
import { isBlock, isTypeHidden, nodeType } from "./filter-types";
import type { NativeRelationSpec, ProjectionSpec } from "./rules";

export interface SourceBoundary {
  scopeIds: ReadonlySet<string> | null;
  searchIds?: ReadonlySet<string>;
  excludedIds: ReadonlySet<string>;
  notebook: string;
  databases: boolean;
}

/** The same first rejection drives graph construction and on-demand inspection. */
export function sourceRejection(
  node: GraphNode,
  boundary: SourceBoundary,
  byId: ReadonlyMap<string, GraphNode>,
) {
  if (boundary.searchIds && !boundary.searchIds.has(node.id)) return "graph.traceOutsideSearch";
  if (boundary.excludedIds.has(node.id)) return "graph.traceExcludedSubtree";
  if (boundary.scopeIds && !boundary.scopeIds.has(node.id)) return "graph.traceOutsideScope";
  if (isBlock(node)) {
    if (boundary.notebook && node.notebook !== boundary.notebook) return "graph.traceOtherNotebook";
  } else {
    if (!boundary.databases) return "graph.traceDatabasesOff";
    if (node.boundBlockId) {
      if (boundary.excludedIds.has(node.boundBlockId)) return "graph.traceBoundBlockExcluded";
      if (boundary.notebook && byId.get(node.boundBlockId)?.notebook !== boundary.notebook)
        return "graph.traceBoundBlockNotebook";
    }
  }
  return null;
}

export function displayRepresentative(
  node: GraphNode,
  rules: ProjectionSpec,
  boundary: SourceBoundary,
  byId: ReadonlyMap<string, GraphNode>,
): GraphNode | null {
  if (!isTypeHidden(rules, nodeType(node))) return node;
  if (!isBlock(node) || !node.rootId) return null;
  const document = byId.get(node.rootId);
  return document &&
    nodeType(document) === "d" &&
    !boundary.excludedIds.has(document.id) &&
    (!boundary.notebook || document.notebook === boundary.notebook)
    ? document
    : null;
}

export interface ProjectionContext {
  boundary: SourceBoundary;
  rules: ProjectionSpec & NativeRelationSpec;
}

// Derived mention graphs retain sourceIds identity, so their trace uses the exact
// native projection inputs. No per-node trace objects or second graph are built.
const sourceIdentities = new WeakMap<GraphDataset, object>();
const contexts = new WeakMap<ReadonlySet<string>, ProjectionContext & { sourceIdentity: object }>();
export function rememberProjection(
  sourceIds: ReadonlySet<string>,
  source: GraphDataset,
  context: ProjectionContext,
): void {
  let sourceIdentity = sourceIdentities.get(source);
  if (!sourceIdentity) {
    sourceIdentity = {};
    sourceIdentities.set(source, sourceIdentity);
  }
  // An old projected graph must not retain source Markdown just to prove identity.
  // The token has no reference back to the source object.
  contexts.set(sourceIds, { ...context, sourceIdentity });
}
export function projectionContext(
  sourceIds: ReadonlySet<string>,
  source: GraphDataset,
): ProjectionContext | undefined {
  const context = contexts.get(sourceIds);
  return context?.sourceIdentity === sourceIdentities.get(source) ? context : undefined;
}
