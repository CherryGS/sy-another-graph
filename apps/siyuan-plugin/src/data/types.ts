import type { ReadIssue } from "./read-issues";

export interface GraphNode {
  id: string;
  label: string;
  notebook: string;
  path: string;
  humanPath?: string;
  index: number;
  degree: number;
  color: string;
  /** Source blocks retain native IDs. Database and item IDs are namespaced. */
  entity?: "block" | "database" | "database-item";
  blockType?: string;
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
  color: string;
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
  mentionBlocks?: MentionBlock[];
}

export interface GraphFilters {
  query: string;
  notebook: string;
  references: boolean;
  hierarchy: boolean;
  hideIsolated: boolean;
  scopeId: string;
  includeChildDocuments: boolean;
  excludeIds: string[];
  /** Keeps only documents even when acquisition adds new block or entity types. */
  documentsOnly: boolean;
  hiddenTypes: string[];
  databases: boolean;
  mentions: MentionMode;
  excludedMentionPhrases: string[];
}

export const DEFAULT_FILTERS: GraphFilters = {
  query: "",
  notebook: "",
  references: true,
  hierarchy: false,
  hideIsolated: false,
  scopeId: "",
  includeChildDocuments: true,
  excludeIds: [],
  documentsOnly: true,
  hiddenTypes: [],
  databases: true,
  mentions: "off",
  excludedMentionPhrases: [],
};

export const PALETTE = [
  "#9a88ff",
  "#51cbbb",
  "#f4b66a",
  "#77acff",
  "#eb8dc1",
  "#b0cc70",
  "#aa9cf0",
  "#65c3e5",
];
import type { MentionBlock, MentionEvidence, MentionMode } from "../mentions/types";
