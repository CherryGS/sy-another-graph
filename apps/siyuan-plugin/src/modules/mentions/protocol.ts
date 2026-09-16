import type { Failure } from "../../core/diagnostics/message";
import type {
  MentionBlock,
  MentionMode,
  MentionProgress,
  MentionResult,
  MentionScope,
} from "./types";

export type MentionRequest =
  | { kind: "load"; revision: number; blocks: MentionBlock[]; excludedPhrases?: readonly string[] }
  | { kind: "exclusions"; revision: number; excludedPhrases: readonly string[] }
  | { kind: "scope"; revision: number; scopeRevision: number; scope: MentionScope }
  | {
      kind: "query";
      revision: number;
      scopeRevision: number;
      request: number;
      mode: MentionMode;
      chosenIds: readonly string[];
    };

export type MentionResponse =
  | { kind: "progress" | "ready"; revision: number; progress: MentionProgress }
  | {
      kind: "result";
      revision: number;
      scopeRevision: number;
      request: number;
      result: MentionResult;
    }
  | { kind: "error"; revision: number; scopeRevision?: number; request?: number; message: Failure };
