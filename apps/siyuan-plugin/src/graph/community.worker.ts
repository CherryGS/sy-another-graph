import init, { detect_communities } from "../../wasm/graph_core.js";
import wasmUrl from "../../wasm/graph_core_bg.wasm?url";

export interface CommunityRequest {
  nodes: number;
  endpoints: Uint32Array;
  resolution: number;
}
export type CommunityResponse =
  | { membership: Uint32Array; calculationMs: number }
  | { error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CommunityRequest>) => void) | null;
  postMessage(value: CommunityResponse, transfer?: Transferable[]): void;
};

scope.onmessage = async ({ data }) => {
  try {
    await init({ module_or_path: wasmUrl });
    const start = performance.now();
    const membership = detect_communities(data.nodes, data.endpoints, data.resolution);
    scope.postMessage({ membership, calculationMs: performance.now() - start }, [membership.buffer]);
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
