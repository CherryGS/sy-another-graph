import type { Failure } from "../../core/diagnostics/message";
import type { MentionExclusions } from "./exclusions";
import type { ExclusionPreviewPage, MentionNameSource } from "./exclusion-preview";

export type ExclusionPreviewRequest =
  | { kind: "load"; revision: number; blocks: MentionNameSource[] }
  | { kind: "preview"; revision: number; request: number; rules: MentionExclusions }
  | {
      kind: "page";
      revision: number;
      request: number;
      pageRequest: number;
      offset: number;
      query: string;
    };
export type ExclusionPreviewResponse =
  | {
      kind: "result";
      revision: number;
      request: number;
      pageRequest: number;
      page: ExclusionPreviewPage;
    }
  | { kind: "error"; revision: number; request?: number; pageRequest?: number; error: Failure };
