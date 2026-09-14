export type GraphDirection = "both" | "in" | "out";
export type GraphTransport = "shared" | "transfer";

export interface EngineStats {
  nodes: number;
  edges: number;
  components: number;
  largestComponent: number;
  buildMs: number;
  backend: string;
  /** This describes Worker buffer transport, not multithreaded WASM. */
  transport: GraphTransport;
}

export interface Neighborhood {
  indices: Uint32Array;
  truncated: boolean;
}

export interface GraphEngine {
  load(nodeCount: number, edges: Uint32Array): Promise<EngineStats>;
  neighborhood(
    seeds: number[],
    direction: GraphDirection,
    depth: number,
    limit: number,
  ): Promise<Neighborhood>;
  shortestPath(
    source: number,
    target: number,
    direction: GraphDirection,
  ): Promise<Uint32Array>;
  dispose(): void;
}
