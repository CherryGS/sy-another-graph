import type { CosmographConfig } from "@cosmograph/cosmograph";
import type { GraphLike } from "../../core/graph/graph-lookups";
import type { CommunityPartition } from "../../modules/communities/community-client";

/** Remap analysis membership by stable identity, never by a renderer's row order. */
export function renderCommunityPartition(
  graph: GraphLike,
  partition: CommunityPartition,
  rendered: { indexToNode: readonly { id: string }[] },
): CommunityPartition {
  if (partition.membership.length !== graph.nodes.length)
    throw new Error("社区结果与当前图不一致。");
  const source = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const membership = new Uint32Array(rendered.indexToNode.length);
  const sizes = new Uint32Array(partition.sizes.length);
  for (let index = 0; index < membership.length; index++) {
    const original = source.get(rendered.indexToNode[index].id);
    if (original === undefined) throw new Error("社区关系端点与当前图不一致。");
    const group = partition.membership[original];
    membership[index] = group;
    sizes[group]++;
  }
  return {
    ...partition,
    membership,
    sizes,
    count: sizes.reduce((sum, size) => sum + Number(size > 1), 0),
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
