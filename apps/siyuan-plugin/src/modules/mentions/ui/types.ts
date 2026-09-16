import type { MentionMode, MentionProgress } from "../types";

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
  chosenCount: number;
  status: MentionStatusView;
  editorKey: string;
  onModeChange: (mode: MentionMode) => void;
  onPhrasesChange: (phrases: string[]) => void;
}
