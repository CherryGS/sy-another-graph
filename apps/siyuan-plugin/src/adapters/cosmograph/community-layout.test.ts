import { describe, expect, it } from "vitest";
import {
  communityLayoutConfig,
  layoutGroupingConfig,
  renderCommunityPartition,
} from "./community-layout";
import { UNGROUPED } from "../../modules/layout-groups/matcher";
import { defaultGrouping } from "../../modules/layout-groups/model";
import type { GraphNode } from "../../core/graph/types";

const node = (id: string, index: number): GraphNode => ({
  id,
  index,
  label: id,
  notebook: "",
  path: "",
});
describe("community analysis and rendering indices", () => {
  it("keeps unmatched set nodes free and maps sparse custom groups to the renderer", () => {
    const nodes = [node("a", 10), node("b", 20), node("other", 30)];
    const graph = { nodes, edges: [] };
    const sizes = new Uint32Array(12);
    sizes[11] = 2;
    const source = {
      membership: new Uint32Array([11, 11, UNGROUPED]),
      sizes,
      count: 1,
      calculationMs: 1,
    };
    const partition = renderCommunityPartition(graph, source, {
      indexToNode: [nodes[2], nodes[0], nodes[1]],
    });
    expect([...partition.membership]).toEqual([UNGROUPED, 11, 11]);
    const grouping = {
      ...defaultGrouping(),
      mode: "sets" as const,
      graph,
      partition,
      pending: false,
      strength: 0.4,
      background: true,
    };
    const config = layoutGroupingConfig(partition, grouping, 2);
    expect(config.pointClusterByFn!(0)).toBeUndefined();
    expect(config.pointClusterByFn!(1)).toBe(11);
    expect(config.simulationCluster).toBe(0.4);
    expect(config.backgroundColor).toBe("#11121a00");
    expect(layoutGroupingConfig(partition, grouping, 3).backgroundColor).toBe("#11121a");
    const off = layoutGroupingConfig(partition, { ...grouping, mode: "off" }, 2);
    expect(off.pointClusterBy).toBeUndefined();
    expect(off.simulationCluster).toBe(0);
    expect(layoutGroupingConfig(undefined, grouping, 2).simulationCluster).toBe(0);
    expect(config).not.toHaveProperty("enableSimulation");
    expect(config).not.toHaveProperty("points");
  });
  it("remaps reordered visible rows without changing semantic membership", () => {
    const nodes = [node("a", 80), node("b", 10), node("c", 50)];
    const graph = { nodes, edges: [] };
    const source = {
      membership: new Uint32Array([0, 0, 2]),
      sizes: new Uint32Array([2, 0, 1]),
      count: 1,
      calculationMs: 3,
    };
    const rendered = { indexToNode: [nodes[2], nodes[1], nodes[0]] };
    const result = renderCommunityPartition(graph, source, rendered);
    expect([...result.membership]).toEqual([2, 0, 0]);
    expect([...source.membership]).toEqual([0, 0, 2]);
    const config = communityLayoutConfig(result);
    expect(config.pointClusterByFn!(0)).toBeUndefined();
    expect(config.pointClusterByFn!(1)).toBe(0);
    expect(config.pointClusterByFn!(2)).toBe(0);
  });

  it("rejects a stale identity instead of attaching membership to another graph", () => {
    const graph = { nodes: [node("a", 0)], edges: [] };
    const partition = {
      membership: new Uint32Array([0]),
      sizes: new Uint32Array([1]),
      count: 0,
      calculationMs: 0,
    };
    expect(() =>
      renderCommunityPartition(graph, partition, { indexToNode: [node("outside", 0)] }),
    ).toThrow("text.communityEndpointsDoNotMatchTheCurrentGraph");
  });
});
