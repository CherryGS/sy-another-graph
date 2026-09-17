import { failureOf } from "../../core/diagnostics/message";
import { encodeGraph } from "./encode-graph";
import type { PreparationRequest, PreparationResponse } from "./preparation-protocol";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<PreparationRequest>) => void) | null;
  postMessage(message: PreparationResponse, transfer?: ArrayBuffer[]): void;
};
scope.onmessage = ({ data }) => {
  try {
    const ipc = encodeGraph(data.columns);
    if (!(ipc.points.buffer instanceof ArrayBuffer) || !(ipc.links.buffer instanceof ArrayBuffer))
      throw new Error("Arrow IPC requires transferable buffers");
    scope.postMessage(
      {
        kind: "prepared",
        request: data.request,
        pointsCount: data.columns.points.id.length,
        linksCount: data.columns.links.sourceIndex.length,
        ipc,
      },
      [ipc.points.buffer, ipc.links.buffer],
    );
  } catch (error) {
    scope.postMessage({ kind: "error", request: data.request, error: failureOf(error) });
  }
};
