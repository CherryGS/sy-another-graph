import type { GraphLike } from "../../core/graph/graph-lookups";
import { isBlock, nodeType } from "../../core/scope/filter-types";
import { excludedContentIds } from "../../core/scope/graph-model";
import { normalizeKeyword } from "../mentions/keywords";
import type { ContentExclusionRule } from "./rules";
import type { ExclusionImpact } from "./pipeline";

export interface ContentExclusionResult {
  steps?: ExclusionImpact[];
  ids: string[];
  matchedRoots: number;
  documents: number;
  blocks: number;
}

/** Worker-only regex execution; no title clipping or mention-vocabulary limits. */
export function matchContentExclusions(
  data: GraphLike,
  rules: readonly ContentExclusionRule[],
): ContentExclusionResult {
  const subtrees = new Set<string>();
  const documents = new Set<string>();
  const idRules = new Map<string, number>();
  const titleRules = rules
    .filter((rule) => rule.kind !== "id")
    .map((rule) => ({
      mask: rule.scope === "subtree" ? 2 : 1,
      regex: rule.kind === "regex" ? new RegExp(rule.value, "iu") : null,
      text: rule.kind === "text" ? normalizeKeyword(rule.value) : "",
    }));
  for (const rule of rules) {
    if (rule.kind !== "id") continue;
    idRules.set(rule.value, (idRules.get(rule.value) ?? 0) | (rule.scope === "subtree" ? 2 : 1));
  }
  const titleMask = titleRules.reduce((mask, rule) => mask | rule.mask, 0);
  const titleMatches = new Map<string, number>();
  const add = (id: string, mask: number) => {
    if (mask & 1) documents.add(id);
    if (mask & 2) subtrees.add(id);
  };
  for (const node of data.nodes) {
    if (!isBlock(node)) continue;
    add(node.id, idRules.get(node.id) ?? 0);
    if (nodeType(node) !== "d" || !titleRules.length) continue;
    const title = normalizeKeyword(node.content ?? node.label);
    let matches = titleMatches.get(title);
    if (matches === undefined) {
      matches = 0;
      for (const { mask, regex, text } of titleRules) {
        if (!(matches & mask) && (regex ? regex.test(title) : title.includes(text)))
          matches |= mask;
        if (matches === titleMask) break;
      }
      titleMatches.set(title, matches);
    }
    add(node.id, matches);
  }
  const excluded = excludedContentIds(data, [...subtrees], [...documents]);
  let documentCount = 0;
  const ids: string[] = [];
  for (const node of data.nodes) {
    if (!isBlock(node) || !excluded.has(node.id)) continue;
    ids.push(node.id);
    if (nodeType(node) === "d") documentCount++;
  }
  return {
    ids,
    matchedRoots: new Set([...subtrees, ...documents]).size,
    documents: documentCount,
    blocks: ids.length - documentCount,
  };
}
