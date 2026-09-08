export interface GraphNode {
  id: string;
  label: string;
  notebook: string;
  path: string;
  index: number;
  degree: number;
  color: string;
}

export interface GraphEdge {
  source: number;
  target: number;
  kind: "reference" | "hierarchy";
  weight: number;
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
  warnings: string[];
}

export interface GraphFilters {
  query: string;
  notebook: string;
  references: boolean;
  hierarchy: boolean;
  hideIsolated: boolean;
}

export const DEFAULT_FILTERS: GraphFilters = {
  query: "",
  notebook: "",
  references: true,
  hierarchy: true,
  hideIsolated: false,
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
