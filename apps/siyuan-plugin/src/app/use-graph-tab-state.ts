import { useEffect, useMemo } from "react";
import type { GraphDataset, GraphFilters } from "../data/types";
import { graphTabState } from "../presets/tab-state";
import { WORKBENCH_PRESET_CHANNEL, type GraphTabStateMessage } from "../presets/host-protocol";

export function useGraphTabState(
  filters: GraphFilters,
  data: GraphDataset | null,
  name: string,
  modified: boolean,
  searchScope?: string,
) {
  const state = useMemo(
    () => graphTabState(filters, data, name, modified, searchScope),
    [filters, data, name, modified, searchScope],
  );
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
