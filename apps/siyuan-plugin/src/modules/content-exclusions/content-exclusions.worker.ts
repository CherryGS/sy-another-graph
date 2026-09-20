import { failureOf } from "../../core/diagnostics/message";
import { matchContentExclusions } from "./matcher";
import type { ContentExclusionRequest, ContentExclusionResponse } from "./protocol";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ContentExclusionRequest>) => void) | null;
  postMessage(value: ContentExclusionResponse): void;
};
scope.onmessage = ({ data }) => {
  try {
    scope.postMessage({ kind: "result", result: matchContentExclusions(data.source, data.rules) });
  } catch (error) {
    scope.postMessage({ kind: "error", error: failureOf(error) });
  }
};
