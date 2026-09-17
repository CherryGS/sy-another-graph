import type { Failure } from "../../core/diagnostics/message";
import type { GraphEdgeKind } from "../../core/graph/types";

export const EDGE_KINDS = [
  "reference",
  "text-mention",
  "hierarchy",
  "database-embedding",
  "database-membership",
  "database-binding",
  "database-relation",
] as const satisfies readonly GraphEdgeKind[];
export const EDGE_COLORS = [
  "#91b7df",
  "#d6b670",
  "#60728d",
  "#8a82ba",
  "#6cbaae",
  "#c3a476",
  "#c797d9",
];

/** Only render columns cross this boundary; source facts and lookup identities stay in the UI. */
export interface GraphColumns {
  points: {
    id: string[];
    label: string[];
    notebook: string[];
    color: string[];
    branchColor: string[];
    degreeColor: string[];
    typeColor: string[];
    degree: Float32Array<ArrayBuffer>;
    accentedIndices: Uint32Array<ArrayBuffer>;
  };
  links: {
    sourceIndex: Uint32Array<ArrayBuffer>;
    targetIndex: Uint32Array<ArrayBuffer>;
    colorIndex: Uint8Array<ArrayBuffer>;
    weight: Float32Array<ArrayBuffer>;
    width: Float32Array<ArrayBuffer>;
    style: Uint8Array<ArrayBuffer>;
  };
}

export interface GraphIPC {
  points: Uint8Array;
  links: Uint8Array;
  encodingMs: number;
}
export type GraphEncoder = (columns: GraphColumns, signal: AbortSignal) => Promise<GraphIPC>;
export interface PreparationRequest {
  request: number;
  columns: GraphColumns;
}
export type PreparationResponse =
  | { kind: "prepared"; request: number; pointsCount: number; linksCount: number; ipc: GraphIPC }
  | { kind: "error"; request: number; error: Failure };

export function columnTransfers(columns: GraphColumns): ArrayBuffer[] {
  return [
    columns.points.degree.buffer,
    columns.points.accentedIndices.buffer,
    ...Object.values(columns.links).map((column) => column.buffer),
  ];
}
