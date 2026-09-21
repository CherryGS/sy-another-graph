import { message, type Message } from "../../core/diagnostics/message";
import { normalizeKeyword, readExcludedPhrases } from "../mentions/keywords";
import {
  formatExclusionDraft,
  parseExclusionDraft,
  readExcludedPatterns,
} from "../mentions/exclusions";

export type GroupingMode = "off" | "community" | "sets";
export interface SetRule {
  kind: "id" | "text" | "regex";
  value: string;
}
export interface LayoutSet {
  id: string;
  name: string;
  enabled: boolean;
  rules: SetRule[];
}
export interface LayoutGrouping {
  mode: GroupingMode;
  strength: number;
  resolution: number;
  background: boolean;
  sets: LayoutSet[];
}

export const SET_LIMIT = 50;
export const SET_RULE_LIMIT = 2_000;
export const SET_PATTERN_LIMIT = 128;
export const GROUPING_RANGES = {
  strength: { min: 0, max: 1, step: 0.01 },
  resolution: { min: 0.25, max: 4, step: 0.25 },
} as const;
const NODE_ID = /^(?:\d{14}-[a-z0-9]{7}|av:[^\s:]+|av-item:[^\s:]+:[^\s:]+)$/u;
const SET_ID = /^[A-Za-z0-9_-]{1,128}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function defaultGrouping(): LayoutGrouping {
  return { mode: "off", strength: 0.15, resolution: 1, background: false, sets: [] };
}

export function normalizeSetName(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function validSetName(value: string): boolean {
  const name = normalizeSetName(value);
  return name.length > 0 && name.length <= 80 && !/[\p{Cc}]/u.test(name);
}

export function normalizeSetRules(rules: readonly SetRule[]): SetRule[] {
  const entries = new Map<string, SetRule>();
  for (const rule of rules) {
    const normalized = {
      kind: rule.kind,
      value: rule.kind === "text" ? normalizeKeyword(rule.value) : rule.value,
    };
    entries.set(JSON.stringify(normalized), normalized);
  }
  return [...entries.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, rule]) => rule);
}

export function readSetRules(value: unknown): SetRule[] | null {
  if (!Array.isArray(value) || value.length > SET_RULE_LIMIT) return null;
  let patterns = 0;
  for (const rule of value) {
    if (!record(rule) || typeof rule.value !== "string") return null;
    if (rule.kind === "id") {
      if (rule.value.length > 256 || !NODE_ID.test(rule.value)) return null;
    } else if (rule.kind === "text") {
      if (readExcludedPhrases([rule.value])?.length !== 1) return null;
    } else if (rule.kind === "regex") {
      if (++patterns > SET_PATTERN_LIMIT || !readExcludedPatterns([rule.value])) return null;
    } else return null;
  }
  return normalizeSetRules(value as SetRule[]);
}

export function parseSetDraft(
  draft: string,
): { value: SetRule[]; error: null } | { value: null; error: Message } {
  const ids: string[] = [];
  const lines = draft.split(/\r\n?|\n/u).map((line) => {
    const values = line
      .trim()
      .split(/[\s,，;；]+/u)
      .filter(Boolean);
    if (values.length && values.every((id) => NODE_ID.test(id))) {
      ids.push(...values);
      return "";
    }
    return line;
  });
  const parsed = parseExclusionDraft(lines.join("\n"));
  if (!parsed.value) return parsed;
  const value = readSetRules([
    ...ids.map((value) => ({ kind: "id", value })),
    ...parsed.value.phrases.map((value) => ({ kind: "text", value })),
    ...parsed.value.patterns.map((value) => ({ kind: "regex", value })),
  ]);
  return value
    ? { value, error: null }
    : {
        value: null,
        error: message("grouping.ruleLimit", {
          rules: SET_RULE_LIMIT,
          patterns: SET_PATTERN_LIMIT,
        }),
      };
}

export function formatSetDraft(rules: readonly SetRule[]): string {
  return formatExclusionDraft(
    rules.filter((rule) => rule.kind !== "regex").map((rule) => rule.value),
    rules.filter((rule) => rule.kind === "regex").map((rule) => rule.value),
  );
}

/** Validate before persistence; clone all nested values without sorting priority. */
export function readGrouping(value: unknown): LayoutGrouping | null {
  if (
    !record(value) ||
    typeof value.mode !== "string" ||
    !["off", "community", "sets"].includes(value.mode) ||
    typeof value.background !== "boolean" ||
    !Array.isArray(value.sets) ||
    value.sets.length > SET_LIMIT
  )
    return null;
  for (const key of ["strength", "resolution"] as const) {
    const number = value[key],
      range = GROUPING_RANGES[key];
    if (
      typeof number !== "number" ||
      !Number.isFinite(number) ||
      number < range.min ||
      number > range.max
    )
      return null;
  }
  const ids = new Set<string>();
  const sets: LayoutSet[] = [];
  let rules = 0,
    patterns = 0;
  for (const item of value.sets) {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      !SET_ID.test(item.id) ||
      ids.has(item.id) ||
      typeof item.name !== "string" ||
      !validSetName(item.name) ||
      typeof item.enabled !== "boolean"
    )
      return null;
    const parsed = readSetRules(item.rules);
    if (!parsed) return null;
    rules += parsed.length;
    patterns += parsed.filter((rule) => rule.kind === "regex").length;
    if (rules > SET_RULE_LIMIT || patterns > SET_PATTERN_LIMIT) return null;
    ids.add(item.id);
    sets.push({
      id: item.id,
      name: normalizeSetName(item.name),
      enabled: item.enabled,
      rules: parsed,
    });
  }
  return {
    mode: value.mode as GroupingMode,
    strength: value.strength as number,
    resolution: value.resolution as number,
    background: value.background,
    sets,
  };
}

export function copyGrouping(value: LayoutGrouping): LayoutGrouping {
  return {
    ...value,
    sets: value.sets.map((set) => ({ ...set, rules: normalizeSetRules(set.rules) })),
  };
}

/** Move only on a completed drop or explicit keyboard step. */
export function reorderSets(
  sets: readonly LayoutSet[],
  id: string,
  destination: number,
): LayoutSet[] {
  const source = sets.findIndex((set) => set.id === id);
  if (source < 0 || !Number.isInteger(destination)) return [...sets];
  const next = [...sets];
  next.splice(source, 1);
  next.splice(Math.max(0, Math.min(destination, next.length)), 0, sets[source]);
  return next;
}

/** Read the old browser-local community settings once; old preset versions use this snapshot. */
export function groupingFromLegacySettings(value: unknown): LayoutGrouping {
  const grouping = defaultGrouping();
  if (!record(value)) return grouping;
  grouping.mode = value.communityEnabled === true ? "community" : "off";
  grouping.background = value.communityBackground === true;
  for (const [key, old] of [
    ["strength", "communityStrength"],
    ["resolution", "communityResolution"],
  ] as const) {
    const number = value[old],
      range = GROUPING_RANGES[key];
    if (typeof number === "number" && Number.isFinite(number))
      grouping[key] = Math.max(range.min, Math.min(range.max, number));
  }
  return grouping;
}
