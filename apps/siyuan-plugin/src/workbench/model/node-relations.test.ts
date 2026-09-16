import { expect, it } from "vitest";
import type { GraphEdge } from "../../core/graph/types";
import { groupNodeRelations } from "./node-relations";

it("separates directions without double-counting projected self references or expanding provenance", () => {
  const outgoing: GraphEdge = { source: 9, target: 42, kind: "reference", weight: 3 };
  const incoming: GraphEdge = { source: 17, target: 9, kind: "hierarchy", weight: 1 };
  const self: GraphEdge = { source: 9, target: 9, kind: "reference", weight: 12 };
  const unrelated: GraphEdge = { source: 17, target: 42, kind: "reference", weight: 1 };
  const groups = groupNodeRelations(9, [outgoing, self, incoming, unrelated]);
  expect(groups).toEqual({ outgoing: [outgoing], incoming: [incoming], self: [self] });
  expect(groups.self[0]).toBe(self);
  expect(groupNodeRelations(100, [outgoing, incoming, self])).toEqual({
    outgoing: [],
    incoming: [],
    self: [],
  });
});
