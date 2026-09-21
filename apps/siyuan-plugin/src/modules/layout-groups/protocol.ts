import type { Failure } from "../../core/diagnostics/message";
import type { GraphLike } from "../../core/graph/graph-lookups";
import type { LayoutSet } from "./model";
import type { MatchNode, SetMembership } from "./matcher";

export interface SetMatchRequest {
  nodes: MatchNode[];
  sets: readonly LayoutSet[];
  source?: GraphLike;
}
export type SetMatchResponse =
  { kind: "result"; result: SetMembership } | { kind: "error"; error: Failure };
