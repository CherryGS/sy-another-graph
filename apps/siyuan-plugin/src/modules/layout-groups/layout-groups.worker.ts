import { failureOf } from "../../core/diagnostics/message";
import { matchLayoutSets } from "./matcher";
import type { SetMatchRequest, SetMatchResponse } from "./protocol";

const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<SetMatchRequest>) => void) | null;
  postMessage(value: SetMatchResponse, transfer?: Transferable[]): void;
};
worker.onmessage = ({ data }: MessageEvent<SetMatchRequest>) => {
  try {
    const result = matchLayoutSets(data.nodes, data.sets, data.source);
    worker.postMessage({ kind: "result", result } satisfies SetMatchResponse, [
      result.membership.buffer,
      result.sizes.buffer,
      result.matches.buffer,
    ]);
  } catch (error) {
    worker.postMessage({ kind: "error", error: failureOf(error) } satisfies SetMatchResponse);
  }
};
