import { DEFAULT_PROJECTION_RULES, type GraphProjectionRules } from "../../core/scope/rules";
import type { MentionMode } from "../mentions/types";

export interface MentionRules {
  mentions: MentionMode;
  excludedMentionPhrases: string[];
}

/** These controls do not change the source boundary or traversal topology. */
export interface DisplayFilters {
  query: string;
  hideIsolated: boolean;
}

/** Keep the v1 persisted shape while giving each computation its own input type. */
export type GraphFilters = GraphProjectionRules & MentionRules & DisplayFilters;

export const DEFAULT_FILTERS: GraphFilters = {
  ...DEFAULT_PROJECTION_RULES,
  query: "",
  hideIsolated: false,
  mentions: "off",
  excludedMentionPhrases: [],
};
