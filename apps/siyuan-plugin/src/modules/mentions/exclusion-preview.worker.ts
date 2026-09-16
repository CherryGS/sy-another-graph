import { failureOf } from "../../core/diagnostics/message";
import { ExclusionPreviewIndex } from "./exclusion-preview";
import type {
  ExclusionPreviewRequest,
  ExclusionPreviewResponse,
} from "./exclusion-preview-protocol";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ExclusionPreviewRequest>) => void) | null;
  postMessage(value: ExclusionPreviewResponse): void;
};
const index = new ExclusionPreviewIndex();
let revision = 0;
let request = 0;
scope.onmessage = ({ data }) => {
  try {
    if (data.kind === "load") {
      revision = data.revision;
      request = 0;
      index.load(data.blocks);
      return;
    }
    if (data.revision !== revision) return;
    if (data.kind === "preview") {
      request = data.request;
      scope.postMessage({
        kind: "result",
        revision,
        request,
        pageRequest: 0,
        page: index.preview(data.rules),
      });
    } else if (data.request === request) {
      scope.postMessage({
        kind: "result",
        revision,
        request,
        pageRequest: data.pageRequest,
        page: index.page(data.offset, data.query),
      });
    }
  } catch (error) {
    scope.postMessage({
      kind: "error",
      revision: data.revision,
      request: "request" in data ? data.request : undefined,
      pageRequest: data.kind === "page" ? data.pageRequest : undefined,
      error: failureOf(error),
    });
  }
};
