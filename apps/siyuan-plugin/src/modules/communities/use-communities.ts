import { useEffect, useMemo, useState } from "react";
import type { GraphLike } from "../../core/graph/graph-lookups";
import {
  calculateCommunities,
  communityEndpoints,
  type CommunityPartition,
} from "./community-client";

interface Input {
  data: GraphLike | null;
  enabled: boolean;
  resolution: number;
}
interface Result {
  input: Input;
  partition?: CommunityPartition;
  error?: string;
}

export function useCommunities(data: GraphLike | null, enabled: boolean, resolution: number) {
  const input = useMemo(() => ({ data, enabled, resolution }), [data, enabled, resolution]);
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    const { data, enabled, resolution } = input;
    if (!data || !enabled || !data.nodes.length) {
      // eslint-disable-next-line react/set-state-in-effect -- Release the obsolete graph snapshot when community computation is inactive.
      setResult(null);
      return;
    }
    const controller = new AbortController();
    void communityEndpoints(data, controller.signal)
      .then((endpoints) =>
        calculateCommunities(
          { nodes: data.nodes.length, endpoints, resolution },
          controller.signal,
        ),
      )
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
  return {
    graph: current?.input.data,
    partition,
    error: current?.error,
    pending: enabled && !!data?.nodes.length && !current,
  };
}
