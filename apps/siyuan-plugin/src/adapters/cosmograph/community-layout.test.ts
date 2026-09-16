import { describe, expect, it } from "vitest";
import { communityLayoutConfig, renderCommunityPartition } from "./community-layout";
import type { GraphNode } from "../../core/graph/types";

const node = (id: string, index: number): GraphNode => ({
  id,
  index,
  label: id,
  notebook: "",
  path: "",
});
describe("community analysis and rendering indices", () => {
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
