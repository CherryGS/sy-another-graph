import { DEFAULT_PROJECTION_RULES, type GraphProjectionRules } from "../../core/scope/rules";
import type { MentionMode } from "../mentions/types";
import type { ContentExclusionRule } from "../content-exclusions/rules";
import { defaultGrouping, type LayoutGrouping } from "../layout-groups/model";

export interface MentionRules {
  mentions: MentionMode;
  excludedMentionPhrases: string[];
  excludedMentionPatterns: string[];
}

/** These controls do not change the source boundary or traversal topology. */
export interface DisplayFilters {
  query: string;
  hideIsolated: boolean;
}

/** Keep source, relation, display and grouping inputs independently reusable. */
export type GraphFilters = GraphProjectionRules &
  MentionRules &
  DisplayFilters & {
    exclusionRules: ContentExclusionRule[];
    grouping: LayoutGrouping;
  };

export const DEFAULT_FILTERS: GraphFilters = {
  ...DEFAULT_PROJECTION_RULES,
  query: "",
  hideIsolated: false,
  mentions: "off",
  excludedMentionPhrases: [],
  excludedMentionPatterns: [],
  exclusionRules: [],
  grouping: defaultGrouping(),
};
