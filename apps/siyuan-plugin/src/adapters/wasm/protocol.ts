import type {
  EngineStats,
  GraphDirection,
  GraphTransport,
  Neighborhood,
} from "../../application/sessions/graph-engine";

interface RequestIdentity {
  id: number;
  revision: number;
}

export type EngineRequest = RequestIdentity &
  (
    | {
        kind: "load";
        nodes: number;
        edges: Uint32Array;
        transport: GraphTransport;
      }
    | {
        kind: "neighborhood";
        seeds: Uint32Array;
        direction: GraphDirection;
        depth: number;
        limit: number;
      }
    | {
        kind: "distances";
        seeds: Uint32Array;
        direction: GraphDirection;
      }
    | {
        kind: "path";
        source: number;
        target: number;
        direction: GraphDirection;
      }
  );

export type EngineResponse = RequestIdentity &
  (
    | { kind: "stats"; value: EngineStats }
    | { kind: "neighborhood"; value: Neighborhood }
    | { kind: "path"; value: Uint32Array }
    | { kind: "distances"; value: Uint32Array }
    | { kind: "error"; message: string }
  );

export function validateUint32(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_fffe) {
    throw new RangeError(`${name} must be a non-negative 32-bit index`);
  }
}

export function directionCode(direction: GraphDirection): number {
  if (direction === "both") return 0;
  if (direction === "in") return 1;
  if (direction === "out") return 2;
  throw new TypeError("Unknown graph direction");
}

export function supportsSharedTransport(): boolean {
  return globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer !== "undefined";
}

/** The producer writes before posting; receivers treat the result as immutable. */
export function copyForTransport(values: Uint32Array, transport: GraphTransport): Uint32Array {
  if (transport === "shared") {
    const result = new Uint32Array(new SharedArrayBuffer(values.byteLength));
    result.set(values);
    return result;
  }
  return new Uint32Array(values);
}

export function transferableBuffers(...values: Uint32Array[]): ArrayBuffer[] {
  return [
    ...new Set(
      values
        .map((value) => value.buffer)
        .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer),
    ),
  ];
}
