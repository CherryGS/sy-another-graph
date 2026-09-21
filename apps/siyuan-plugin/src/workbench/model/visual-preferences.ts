import { useEffect, useState } from "react";
import type { GraphColorMode } from "../presentation/node-colors";
import {
  groupingFromLegacySettings,
  readGrouping,
  type LayoutGrouping,
} from "../../modules/layout-groups/model";
import {
  DEFAULT_GRAPH_SETTINGS,
  normalizeGraphSettings,
  type GraphSettings,
} from "../presentation/settings";

export const VISUAL_PREFERENCES_KEY = "sy-another-graph:appearance:v2";
const LEGACY_KEY = "sy-another-graph:appearance:v1";
export interface VisualPreferences {
  colorBy: GraphColorMode;
  pointSize: number;
  showLabels: boolean;
  showLinks: boolean;
  graphSettings: GraphSettings;
  /** Retained migration input until every old host-side preset has been saved as v2. */
  legacyGrouping: LayoutGrouping;
}

export function normalizeVisualPreferences(value: unknown): VisualPreferences {
  const candidate = value && typeof value === "object" ? (value as Partial<VisualPreferences>) : {};
  return {
    colorBy: ["type", "branch", "notebook", "degree"].includes(candidate.colorBy ?? "")
      ? candidate.colorBy!
      : "type",
    pointSize:
      typeof candidate.pointSize === "number" && Number.isFinite(candidate.pointSize)
        ? Math.min(10, Math.max(1, candidate.pointSize))
        : 4,
    showLabels: typeof candidate.showLabels === "boolean" ? candidate.showLabels : true,
    showLinks: typeof candidate.showLinks === "boolean" ? candidate.showLinks : true,
    graphSettings: normalizeGraphSettings(candidate.graphSettings),
    legacyGrouping:
      readGrouping(candidate.legacyGrouping) ?? groupingFromLegacySettings(candidate.graphSettings),
  };
}

function readStoredPreferences(
  storage: Pick<Storage, "getItem">,
  key: string,
): Partial<VisualPreferences> | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<VisualPreferences>)
      : null;
  } catch {
    return null;
  }
}

/** Read-only restoration; the hook writes the normalized result to v2. */
export function readVisualPreferences(storage?: Pick<Storage, "getItem">): VisualPreferences {
  let available: Pick<Storage, "getItem">;
  try {
    available = storage ?? localStorage;
  } catch {
    return normalizeVisualPreferences(null);
  }
  const current = readStoredPreferences(available, VISUAL_PREFERENCES_KEY);
  if (current) return normalizeVisualPreferences(current);
  const legacy = readStoredPreferences(available, LEGACY_KEY);
  const restored = normalizeVisualPreferences(legacy);
  // v1 persisted the accidentally increased default. v2 keeps a later explicit 1.
  if (legacy?.graphSettings?.linkSpring === 1)
    restored.graphSettings.linkSpring = DEFAULT_GRAPH_SETTINGS.linkSpring;
  return restored;
}

export function useVisualPreferences() {
  const [preferences, setPreferences] = useState(() => readVisualPreferences());
  useEffect(() => {
    try {
      localStorage.setItem(VISUAL_PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      /* Appearance remains usable when browser storage is unavailable. */
    }
  }, [preferences]);
  return { preferences, setPreferences };
}
