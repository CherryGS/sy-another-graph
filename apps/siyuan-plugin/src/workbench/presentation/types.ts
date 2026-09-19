import type { GraphColorMode } from "./node-colors";
import type { GraphEdge } from "../../core/graph/types";
import type { GraphSettings } from "./settings";
import type { SearchOrigins } from "../../modules/search/origins";
import type { GraphLike } from "../../core/graph/graph-lookups";
import type { GraphLayers } from "../../modules/layout/layers";

import type { CanvasNode } from "./present-nodes";
export type { CanvasNode } from "./present-nodes";
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

export interface GraphCanvasProps {
  /** Semantic topology is independent of color, prepared rows and hidden isolates. */
  analysisGraph: GraphLike;
  layers?: GraphLayers;
  relayoutRequest?: number;
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
  /** The node being inspected. It has no implicit chosen membership. */
  selectedId: string | null;
  /** The only set that receives persistent labels and fixed positions. */
  chosenIds: readonly string[];
  highlightedIds?: readonly string[];
  spotlightIds?: readonly string[];
  /** Exact real reference edges temporarily emphasized by relationship discovery. */
  evidenceEdges?: readonly GraphEdge[];
  /** Search origin markings are independent of selection, focus, and pinning. */
  searchOrigins?: SearchOrigins;
  active?: boolean;
  colorBy?: GraphColorMode;
  settings?: GraphSettings;
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
