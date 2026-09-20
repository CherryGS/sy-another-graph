import { message, type Message } from "../../core/diagnostics/message";
import {
  formatExclusionDraft,
  parseExclusionDraft,
  readExcludedPatterns,
} from "../mentions/exclusions";
import { normalizeKeyword, readExcludedPhrases } from "../mentions/keywords";

export type ExclusionScope = "document" | "subtree";
export interface ContentExclusionRule {
  kind: "id" | "text" | "regex";
  value: string;
  scope: ExclusionScope;
}

export const CONTENT_EXCLUSION_LIMIT = 2_000;
const NATIVE_ID = /^\d{14}-[a-z0-9]{7}$/;

export function normalizeContentExclusions(
  rules: readonly ContentExclusionRule[],
): ContentExclusionRule[] {
  const unique = new Map<string, ContentExclusionRule>();
  for (const rule of rules) {
    const normalized = {
      kind: rule.kind,
      value: rule.kind === "text" ? normalizeKeyword(rule.value) : rule.value,
      scope: rule.scope,
    };
    unique.set(JSON.stringify(normalized), normalized);
  }
  return [...unique.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, rule]) => rule);
}

/** Additive v1 persistence: old ID exclusions retain their subtree behavior. */
export function contentExclusionRules(
  ids: readonly string[],
  rules: readonly ContentExclusionRule[],
): ContentExclusionRule[] {
  return normalizeContentExclusions([
    ...ids.map((value): ContentExclusionRule => ({ kind: "id", value, scope: "subtree" })),
    ...rules,
  ]);
}

export function splitContentExclusions(rules: readonly ContentExclusionRule[]) {
  const normalized = normalizeContentExclusions(rules);
  return {
    excludeIds: normalized
      .filter((rule) => rule.kind === "id" && rule.scope === "subtree")
      .map((rule) => rule.value)
      .sort(),
    exclusionRules: normalized.filter((rule) => rule.kind !== "id" || rule.scope !== "subtree"),
  };
}

export function readContentExclusions(value: unknown): ContentExclusionRule[] | null {
  if (!Array.isArray(value) || value.length > CONTENT_EXCLUSION_LIMIT) return null;
  let patterns = 0;
  for (const rule of value) {
    if (
      !rule ||
      typeof rule !== "object" ||
      typeof rule.value !== "string" ||
      (rule.scope !== "document" && rule.scope !== "subtree")
    )
      return null;
    if (rule.kind === "id") {
      if (!NATIVE_ID.test(rule.value)) return null;
    } else if (rule.kind === "text") {
      if (readExcludedPhrases([rule.value])?.length !== 1) return null;
    } else if (rule.kind === "regex") {
      if (++patterns > 128 || !readExcludedPatterns([rule.value])) return null;
    } else return null;
  }
  return normalizeContentExclusions(value);
}

export function parseContentExclusionDraft(
  draft: string,
  scope: ExclusionScope,
): { value: ContentExclusionRule[]; error: null } | { value: null; error: Message } {
  // Keep the same literal escaping, normalization, regex grammar and errors as
  // mention exclusions. Here literals match title substrings instead of names.
  // Continue accepting pasted lists of IDs without splitting ordinary titles.
  const pastedIds: string[] = [];
  const lines = draft.split(/\r\n?|\n/u).map((line) => {
    const ids = line
      .trim()
      .split(/[\s,，;；]+/u)
      .filter(Boolean);
    if (ids.length > 0 && ids.every((id) => NATIVE_ID.test(id))) {
      pastedIds.push(...ids);
      return ""; // Preserve original line numbers for regex diagnostics.
    }
    return line;
  });
  const parsed = parseExclusionDraft(lines.join("\n"));
  if (!parsed.value) return parsed;
  const rules: ContentExclusionRule[] = [
    ...pastedIds.map((value): ContentExclusionRule => ({ kind: "id", value, scope })),
    ...parsed.value.phrases.map((value): ContentExclusionRule => ({
      kind: NATIVE_ID.test(value) ? "id" : "text",
      value,
      scope,
    })),
    ...parsed.value.patterns.map((value): ContentExclusionRule => ({
      kind: "regex",
      value,
      scope,
    })),
  ];
  if (rules.length > CONTENT_EXCLUSION_LIMIT)
    return {
      value: null,
      error: message("contentExclusions.limit", { count: CONTENT_EXCLUSION_LIMIT }),
    };
  return { value: normalizeContentExclusions(rules), error: null };
}

export function formatContentExclusionDraft(
  rules: readonly ContentExclusionRule[],
  scope: ExclusionScope,
): string {
  const group = rules.filter((rule) => rule.scope === scope);
  return formatExclusionDraft(
    group.filter((rule) => rule.kind !== "regex").map((rule) => rule.value),
    group.filter((rule) => rule.kind === "regex").map((rule) => rule.value),
  );
}
