import { normalizeKeyword } from "../mentions/keywords";
import type { GraphLike } from "../../core/graph/graph-lookups";
import { containedSubtreeIds } from "../../core/scope/graph-model";
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

/** ID rules include native descendants; title rules match visible nodes independently. */
export function matchLayoutSets(
  nodes: readonly MatchNode[],
  sets: readonly LayoutSet[],
  source?: GraphLike,
): SetMembership {
  const started = performance.now();
  const normalizedTitles = nodes.map((node) => normalizeKeyword(node.title));
  const membership = new Uint32Array(nodes.length).fill(UNGROUPED);
  const sizes = new Uint32Array(sets.length);
  const matches = new Uint32Array(sets.length);
  for (let group = 0; group < sets.length; group++) {
    const set = sets[group];
    if (!set.enabled) continue;
    const roots = set.rules.filter((rule) => rule.kind === "id").map((rule) => rule.value);
    const ids = source ? containedSubtreeIds(source, roots) : new Set<string>();
    // Logical database identities remain exact matches, with no native descendants.
    for (const id of roots) ids.add(id);
    const titles = set.rules
      .filter((rule) => rule.kind === "text")
      .map((rule) => normalizeKeyword(rule.value));
    const patterns = set.rules
      .filter((rule) => rule.kind === "regex")
      .map((rule) => new RegExp(rule.value, "iu"));
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index],
        title = normalizedTitles[index];
      if (
        !ids.has(node.id) &&
        !titles.some((text) => title.includes(text)) &&
        !patterns.some((pattern) => pattern.test(title))
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
