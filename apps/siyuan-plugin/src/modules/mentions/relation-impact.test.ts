import { expect, it } from "vitest";
import type { GraphEdge } from "../../core/graph/types";
import { mentionRelationImpact } from "./relation-impact";

it("compares directed relations independently of weight, and reports alternate matches exposed by exclusions", () => {
  const edge = (source: number, target: number, weight = 1): GraphEdge => ({
    source,
    target,
    kind: "text-mention",
    weight,
  });
  const result = mentionRelationImpact(
    [edge(0, 1), edge(0, 1), edge(1, 2)],
    [edge(0, 1, 8), edge(2, 1)],
  );
  expect(result.removed).toEqual([edge(1, 2)]);
  expect(result.added).toEqual([edge(2, 1)]);
});
