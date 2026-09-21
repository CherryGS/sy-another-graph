import type { Failure } from "../../core/diagnostics/message";
import type { GraphLike } from "../../core/graph/graph-lookups";
import type { ContentExclusionRule } from "./rules";
import type { ContentExclusionResult } from "./matcher";
import type { ExclusionContext } from "./pipeline-model";

export interface ContentExclusionRequest {
  source: GraphLike;
  rules: readonly ContentExclusionRule[];
  context?: ExclusionContext;
}
export type ContentExclusionResponse =
  { kind: "result"; result: ContentExclusionResult } | { kind: "error"; error: Failure };
