import { normalizeKeyword } from "../mentions/keywords";
import type { LayoutSet } from "./model";

export const UNGROUPED = 0xffff_ffff;
export interface MatchNode {
  id: string;
  title: string;
}
export interface SetMembership {
  keys: string[];
  membership: Uint32Array;
  sizes: Uint32Array;
  matches: Uint32Array;
  count: number;
  calculationMs: number;
}

/** Worker-only regex execution. Each node is independent, even when IDs are ancestors. */
export function matchLayoutSets(
  nodes: readonly MatchNode[],
  sets: readonly LayoutSet[],
): SetMembership {
  const started = performance.now();
  const compiled = sets.map((set) => ({
    enabled: set.enabled,
    ids: new Set(set.rules.filter((rule) => rule.kind === "id").map((rule) => rule.value)),
    titles: set.rules
      .filter((rule) => rule.kind === "text")
      .map((rule) => normalizeKeyword(rule.value)),
    patterns: set.rules
      .filter((rule) => rule.kind === "regex")
      .map((rule) => new RegExp(rule.value, "iu")),
  }));
  const membership = new Uint32Array(nodes.length).fill(UNGROUPED);
  const sizes = new Uint32Array(sets.length);
  const matches = new Uint32Array(sets.length);
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index],
      title = normalizeKeyword(node.title);
    for (let group = 0; group < compiled.length; group++) {
      const rule = compiled[group];
      if (!rule.enabled) continue;
      if (
        !rule.ids.has(node.id) &&
        !rule.titles.some((text) => title.includes(text)) &&
        !rule.patterns.some((pattern) => pattern.test(title))
      )
        continue;
      matches[group]++;
      if (membership[index] === UNGROUPED) {
        membership[index] = group;
        sizes[group]++;
      }
    }
  }
  return {
    keys: sets.map((set) => set.id),
    membership,
    sizes,
    matches,
    count: sizes.reduce((n, size) => n + Number(size > 1), 0),
    calculationMs: performance.now() - started,
  };
}
