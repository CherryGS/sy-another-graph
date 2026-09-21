import { message as msg, MessageError } from "../../core/diagnostics/message";
import type { CosmographConfig } from "@cosmograph/cosmograph";
import type { GraphLike } from "../../core/graph/graph-lookups";
import type { CommunityPartition } from "../../modules/communities/community-client";
import type { GraphGrouping } from "../../workbench/presentation/types";

/** Remap analysis membership by stable identity, never by a renderer's row order. */
export function renderCommunityPartition(
  graph: GraphLike,
  partition: CommunityPartition,
  rendered: { indexToNode: readonly { id: string }[] },
): CommunityPartition {
  if (partition.membership.length !== graph.nodes.length)
    throw new MessageError(msg("text.communityResultsDoNotMatchTheCurrentGraph"));
  const source = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const membership = new Uint32Array(rendered.indexToNode.length);
  const sizes = new Uint32Array(partition.sizes.length);
  for (let index = 0; index < membership.length; index++) {
    const original = source.get(rendered.indexToNode[index].id);
    if (original === undefined)
      throw new MessageError(msg("text.communityEndpointsDoNotMatchTheCurrentGraph"));
    const group = partition.membership[original];
    membership[index] = group;
    if (group < sizes.length) sizes[group]++;
  }
  return {
    ...partition,
    membership,
    sizes,
    count: sizes.reduce((sum, size) => sum + Number(size > 1), 0),
  };
}

export function layoutGroupingConfig(
  partition: CommunityPartition | undefined,
  grouping: GraphGrouping | undefined,
  dimensions: 2 | 3,
): CosmographConfig {
  const active = !!grouping && grouping.mode !== "off" && !!partition;
  return {
    ...communityLayoutConfig(active ? partition : undefined),
    simulationCluster: active ? (grouping?.strength ?? 0) : 0,
    backgroundColor: active && grouping?.background && dimensions === 2 ? "#11121a00" : "#11121a",
  };
}

export function communityLayoutConfig(partition: CommunityPartition | undefined): CosmographConfig {
  return {
    pointClusterBy: partition ? "index" : undefined,
    pointClusterByFn: partition
      ? (index: number) =>
          partition.sizes[partition.membership[index]] > 1 ? partition.membership[index] : undefined
      : undefined,
    showClusterLabels: false,
    selectClusterOnLabelClick: false,
  };
}
