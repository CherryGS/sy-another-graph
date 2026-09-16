import type { MentionBlock, MentionMode, MentionProgress } from "../types";
import type { GraphNode } from "../../../core/graph/types";
import type { MentionExclusions } from "../exclusions";

export interface MentionStatusView {
  progress: MentionProgress;
  ready: boolean;
  pending: boolean;
  error: string;
  result: { truncated: boolean };
  retry: () => void;
}

export interface MentionControlsProps {
  mode: MentionMode;
  phrases: readonly string[];
  patterns: readonly string[];
  previewSource: {
    blocks?: readonly MentionBlock[];
    nodes?: ReadonlyMap<string, GraphNode>;
    open: (id: string) => void;
  };
  chosenCount: number;
  status: MentionStatusView;
  editorKey: string;
  onModeChange: (mode: MentionMode) => void;
  onExclusionsChange: (rules: MentionExclusions) => void;
}
