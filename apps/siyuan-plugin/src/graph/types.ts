export interface CanvasNode {
  id: string;
  label: string;
  notebook: string;
  path: string;
  index: number;
  degree: number;
  color: string;
}

export interface CanvasEdge {
  source: number;
  target: number;
  kind: "reference" | "hierarchy";
  weight: number;
}

export interface CanvasStats {
  pointsCount: number;
  linksCount: number;
  preparationMs: number;
  renderingMs: number;
}

export interface CosmographCanvasProps {
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
  showLabels: boolean;
  showLinks: boolean;
  pointSize: number;
  paused: boolean;
  fitRequest: number;
  onReady?: (stats: CanvasStats) => void;
}
