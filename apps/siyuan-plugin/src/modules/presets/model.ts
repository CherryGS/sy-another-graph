import { message as msg, MessageError } from "../../core/diagnostics/message";
import { DEFAULT_FILTERS, type GraphFilters } from "./filters";
import { isMentionMode } from "../mentions/types";
import {
  copyGrouping,
  defaultGrouping,
  readGrouping,
  type LayoutGrouping,
} from "../layout-groups/model";
import { normalizeExcludedPhrases, readExcludedPhrases } from "../mentions/keywords";
import { normalizeExcludedPatterns, readExcludedPatterns } from "../mentions/exclusions";
import {
  contentExclusionRules,
  readContentExclusions,
  splitContentExclusions,
} from "../content-exclusions/rules";

export type PresetFilters = Omit<GraphFilters, "query">;
export interface FilterPreset {
  id: string;
  name: string;
  filters: PresetFilters;
}
export interface PresetStore {
  version: 1 | 2;
  presets: FilterPreset[];
  activePresetId: string | null;
}

export const PRESET_LIMIT = 50;
export const PRESET_NAME_LIMIT = 80;
const NATIVE_ID = /^\d{14}-[a-z0-9]{7}$/;
const PRESET_ID = /^[A-Za-z0-9_-]{1,128}$/;
const hasControl = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const uniqueSorted = (values: readonly string[]) => [...new Set(values)].sort();

export function presetName(value: string): string {
  const name = value.replace(/\s+/gu, " ").trim();
  if (!name || name.length > PRESET_NAME_LIMIT || hasControl(name))
    throw new MessageError(msg("text.enterAPresetNameBetween1AndValue", { p0: PRESET_NAME_LIMIT }));
  return name;
}

/** Presets contain filter rules; search and selection remain exploration state. */
export function presetFilters(filters: PresetFilters): PresetFilters {
  return {
    notebook: filters.notebook,
    references: filters.references,
    hierarchy: filters.hierarchy,
    hideIsolated: filters.hideIsolated,
    scopeId: filters.scopeId,
    includeChildDocuments: filters.includeChildDocuments,
    ...splitContentExclusions(
      contentExclusionRules(filters.excludeIds, filters.exclusionRules ?? []),
    ),
    hiddenTypes: filters.documentsOnly
      ? []
      : uniqueSorted(filters.hiddenTypes.filter((type) => type !== "d")),
    documentsOnly: filters.documentsOnly,
    databases: filters.databases,
    mentions: filters.mentions,
    excludedMentionPhrases: normalizeExcludedPhrases(filters.excludedMentionPhrases ?? []),
    excludedMentionPatterns: normalizeExcludedPatterns(filters.excludedMentionPatterns ?? []),
    grouping: copyGrouping(filters.grouping),
  };
}

export function samePresetFilters(left: PresetFilters, right: PresetFilters): boolean {
  return JSON.stringify(presetFilters(left)) === JSON.stringify(presetFilters(right));
}

/** Applying metadata-equivalent presets must not upload the same graph again.
 * Preserve structural collection identities when only relation mode changes. */
export function applyPresetFilters(previous: GraphFilters, rules: PresetFilters): GraphFilters {
  if (samePresetFilters(previous, rules)) return previous;
  const next = presetFilters(rules);
  const sameValues = (left: readonly string[], right: readonly string[]) =>
    JSON.stringify(uniqueSorted(left)) === JSON.stringify(uniqueSorted(right));
  return {
    ...next,
    query: previous.query,
    grouping:
      JSON.stringify(previous.grouping) === JSON.stringify(next.grouping)
        ? previous.grouping
        : next.grouping,
    excludeIds: sameValues(previous.excludeIds, next.excludeIds)
      ? previous.excludeIds
      : next.excludeIds,
    exclusionRules:
      JSON.stringify(previous.exclusionRules) === JSON.stringify(next.exclusionRules)
        ? previous.exclusionRules
        : next.exclusionRules,
    hiddenTypes: sameValues(previous.hiddenTypes, next.hiddenTypes)
      ? previous.hiddenTypes
      : next.hiddenTypes,
    excludedMentionPhrases: sameValues(previous.excludedMentionPhrases, next.excludedMentionPhrases)
      ? previous.excludedMentionPhrases
      : next.excludedMentionPhrases,
    excludedMentionPatterns: sameValues(
      previous.excludedMentionPatterns,
      next.excludedMentionPatterns,
    )
      ? previous.excludedMentionPatterns
      : next.excludedMentionPatterns,
  };
}

export function createPresetStore(
  defaultName = "Document references",
  grouping = defaultGrouping(),
): PresetStore {
  return {
    version: 2,
    presets: [
      {
        id: "documents",
        name: defaultName,
        filters: presetFilters({ ...DEFAULT_FILTERS, grouping }),
      },
    ],
    activePresetId: "documents",
  };
}

function readFilters(value: unknown, version: 1 | 2): PresetFilters | null {
  if (!record(value)) return null;
  const grouping = version === 1 ? defaultGrouping() : readGrouping(value.grouping);
  if (!grouping) return null;
  for (const key of [
    "references",
    "hierarchy",
    "hideIsolated",
    "includeChildDocuments",
    "databases",
    "documentsOnly",
  ])
    if (typeof value[key] !== "boolean") return null;
  for (const key of ["notebook", "scopeId"])
    if (typeof value[key] !== "string" || (value[key] !== "" && !NATIVE_ID.test(value[key])))
      return null;
  if (
    !isMentionMode(value.mentions) ||
    !Array.isArray(value.excludeIds) ||
    value.excludeIds.length > 2_000 ||
    !value.excludeIds.every((id) => typeof id === "string" && NATIVE_ID.test(id)) ||
    !Array.isArray(value.hiddenTypes) ||
    value.hiddenTypes.length > 256 ||
    !value.hiddenTypes.every(
      (type) =>
        typeof type === "string" && type.length > 0 && type.length <= 64 && !hasControl(type),
    )
  )
    return null;
  // Existing v1 presets predate phrase exclusions and keep their empty default.
  const excludedMentionPhrases = readExcludedPhrases(
    value.excludedMentionPhrases === undefined ? [] : value.excludedMentionPhrases,
  );
  if (!excludedMentionPhrases) return null;
  // Keep legacy slash-delimited phrases literal; patterns have their own field.
  const excludedMentionPatterns = readExcludedPatterns(
    value.excludedMentionPatterns === undefined ? [] : value.excludedMentionPatterns,
  );
  if (!excludedMentionPatterns) return null;
  const exclusionRules = readContentExclusions(
    value.exclusionRules === undefined ? [] : value.exclusionRules,
  );
  if (
    !exclusionRules ||
    !readContentExclusions(contentExclusionRules(value.excludeIds, exclusionRules))
  )
    return null;
  return presetFilters({
    ...value,
    excludedMentionPhrases,
    excludedMentionPatterns,
    exclusionRules,
    grouping,
  } as unknown as PresetFilters);
}

/** Reject corrupt/unsupported persisted data instead of replacing it with defaults. */
export function readPresetStore(value: unknown): PresetStore | null {
  if (
    !record(value) ||
    (value.version !== 1 && value.version !== 2) ||
    !Array.isArray(value.presets) ||
    value.presets.length > PRESET_LIMIT ||
    (value.activePresetId !== null && typeof value.activePresetId !== "string")
  )
    return null;
  const presets: FilterPreset[] = [];
  const ids = new Set<string>();
  for (const item of value.presets) {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      !PRESET_ID.test(item.id) ||
      ids.has(item.id) ||
      typeof item.name !== "string"
    )
      return null;
    const filters = readFilters(item.filters, value.version);
    if (!filters) return null;
    let name: string;
    try {
      name = presetName(item.name);
    } catch {
      return null;
    }
    ids.add(item.id);
    presets.push({ id: item.id, name, filters });
  }
  if (value.activePresetId !== null && !ids.has(value.activePresetId)) return null;
  return { version: value.version, presets, activePresetId: value.activePresetId as string | null };
}

/** The old global community preference applied to every preset. Copy it once
 * into each legacy preset; v2 never consults that browser preference again. */
export function migratePresetGrouping(store: PresetStore, legacy: LayoutGrouping): PresetStore {
  if (store.version === 2) return store;
  return {
    ...store,
    version: 2,
    presets: store.presets.map((preset) => ({
      ...preset,
      filters: { ...preset.filters, grouping: copyGrouping(legacy) },
    })),
  };
}
