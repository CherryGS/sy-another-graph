import type { MentionMode, MentionProgress } from "../types";
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
  chosenCount: number;
  status: MentionStatusView;
  editorKey: string;
  onModeChange: (mode: MentionMode) => void;
  onExclusionsChange: (rules: MentionExclusions) => void;
}
