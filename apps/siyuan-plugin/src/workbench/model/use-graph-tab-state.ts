import { useLocale } from "../../shared/i18n/react";
import { useEffect } from "react";
import type { GraphDataset } from "../../core/graph/types";
import type { GraphFilters } from "../../modules/presets/filters";
import { graphTabState } from "../presentation/tab-state";
import {
  WORKBENCH_PRESET_CHANNEL,
  type GraphTabStateMessage,
} from "../../modules/presets/host-protocol";

export function useGraphTabState(
  filters: GraphFilters,
  data: GraphDataset | null,
  name: string,
  modified: boolean,
  searchScope?: string,
) {
  useLocale();
  const state = graphTabState(filters, data, name, modified, searchScope);
  const { title, description } = state;
  useEffect(() => {
    if (window.parent === window) return;
    const message: GraphTabStateMessage = {
      channel: WORKBENCH_PRESET_CHANNEL,
      type: "graph-tab-state",
      title,
      description,
    };
    window.parent.postMessage(message, window.location.origin);
  }, [title, description]);
  return state;
}
