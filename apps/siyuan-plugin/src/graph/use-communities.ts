import { useEffect, useMemo, useState } from "react";
import type { CosmographConfig } from "@cosmograph/cosmograph";
import type { PreparedGraph } from "./prepare-graph";
import { calculateCommunities, communityEndpoints, type CommunityPartition } from "./community-client";

interface Input {
  data: PreparedGraph | null;
  enabled: boolean;
  resolution: number;
}
interface Result {
  input: Input;
  partition?: CommunityPartition;
  error?: string;
}

export function useCommunities(data: PreparedGraph | null, enabled: boolean, resolution: number) {
  const input = useMemo(() => ({ data, enabled, resolution }), [data, enabled, resolution]);
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    const { data, enabled, resolution } = input;
    if (!data || !enabled || !data.pointsCount) return;
    const controller = new AbortController();
    void communityEndpoints(data, controller.signal)
      .then((endpoints) => calculateCommunities({ nodes: data.pointsCount, endpoints, resolution }, controller.signal))
      .then((partition) => {
        if (!controller.signal.aborted) setResult({ input, partition });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ input, error: error instanceof Error ? error.message : "社区计算失败。" });
      });
    return () => controller.abort();
  }, [input]);

  const current = enabled && result?.input === input ? result : null;
  const partition = current?.partition;
  const config: CosmographConfig = useMemo(() => ({
    pointClusterBy: partition ? "index" : undefined,
    pointClusterByFn: partition
      ? (index: number) => partition.sizes[partition.membership[index]] > 1 ? partition.membership[index] : undefined
      : undefined,
    showClusterLabels: false,
    selectClusterOnLabelClick: false,
  }), [partition]);
  return { partition, config, error: current?.error, pending: enabled && !!data?.pointsCount && !current };
}
