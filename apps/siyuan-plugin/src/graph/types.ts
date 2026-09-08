import type { GraphColorMode } from "./node-colors";
import type { GraphEdge, GraphNode } from "../data/types";

export type CanvasNode = GraphNode;
export type CanvasEdge = GraphEdge;

export interface CanvasSelectEvent {
  shiftKey: boolean;
  detail: number;
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
  /** The node being inspected. It has no implicit chosen membership. */
  selectedId: string | null;
  /** The only set that receives persistent labels and fixed positions. */
  chosenIds: readonly string[];
  highlightedIds?: readonly string[];
  spotlightIds?: readonly string[];
  active?: boolean;
  colorBy?: GraphColorMode;
  notebookNames?: Readonly<Record<string, string>>;
  onSelect: (id: string | null, event?: CanvasSelectEvent) => void;
  onClearChosen: () => void;
  onInspectEdge: (edge: CanvasEdge) => void;
  onOpen: (id: string) => void;
  showLabels: boolean;
  showLinks: boolean;
  pointSize: number;
  paused: boolean;
  fitRequest: number;
  onReady?: (stats: CanvasStats) => void;
}
