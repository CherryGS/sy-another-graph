import type { SourceTextBlock } from "./source-text";
import type { ReadIssue } from "../diagnostics/read-issues";

export interface NodeFacts {
  id: string;
  label: string;
  notebook: string;
  path: string;
  humanPath?: string;
  /** Source blocks retain native IDs. Database and item IDs are namespaced. */
  entity?: "block" | "database" | "database-item";
  blockType?: string;
  /** Known from the acquired document's own body, before any graph filtering. */
  emptyDocument?: boolean;
  rootId?: string;
  parentId?: string;
  content?: string;
  documentLabel?: string;
  heading?: string;
  /** An actual source block that the native editor can open. */
  openBlockId?: string;
  databaseId?: string;
  itemId?: string;
  boundBlockId?: string;
}

/** A numeric handle is local to one immutable graph snapshot; only id is persistent. */
export interface GraphNode extends NodeFacts {
  index: number;
}

export interface MentionEvidence {
  keyword: string;
  matched: string;
  excerpt: string;
  start: number;
  end: number;
  candidates: number;
}

export type GraphEdgeKind =
  | "reference"
  | "text-mention"
  | "hierarchy"
  | "database-embedding"
  | "database-membership"
  | "database-binding"
  | "database-relation";

/** Original source facts survive filtering and document endpoint projection. */
export interface GraphProvenance {
  sourceId: string;
  targetId: string;
  kind: GraphEdgeKind;
  weight: number;
  mention?: MentionEvidence;
  databaseId?: string;
  targetDatabaseId?: string;
  sourceItemId?: string;
  targetItemId?: string;
  fieldId?: string;
  fieldName?: string;
  pairedFieldId?: string;
  isTwoWay?: boolean;
  /** Native containment steps represented by a virtual displayed edge. */
  viaIds?: string[];
}

export interface GraphEdge {
  source: number;
  target: number;
  kind: GraphEdgeKind;
  weight: number;
  provenance?: GraphProvenance[];
  omittedProvenance?: number;
  ambiguous?: boolean;
}

export interface Notebook {
  id: string;
  name: string;
}

export interface GraphDataset {
  nodes: GraphNode[];
  edges: GraphEdge[];
  notebooks: Notebook[];
  source: "siyuan";
  loadedAt: string;
  loadMs: number;
  referenceCount: number;
  skippedReferences: number;
  warnings: ReadIssue[];
  mentionBlocks?: SourceTextBlock[];
}
