import { useEffect, useState } from "react";
import type { GraphColorMode } from "../graph/node-colors";
import { normalizeGraphSettings, type GraphSettings } from "../graph/settings";

const KEY = "sy-another-graph:appearance:v1";
export interface VisualPreferences {
  colorBy: GraphColorMode;
  pointSize: number;
  showLabels: boolean;
  showLinks: boolean;
  graphSettings: GraphSettings;
}

export function normalizeVisualPreferences(value: unknown): VisualPreferences {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<VisualPreferences>)
      : {};
  return {
    colorBy: ["type", "branch", "notebook", "degree"].includes(
      candidate.colorBy ?? "",
    )
      ? candidate.colorBy!
      : "type",
    pointSize:
      typeof candidate.pointSize === "number" &&
      Number.isFinite(candidate.pointSize)
        ? Math.min(10, Math.max(1, candidate.pointSize))
        : 4,
    showLabels:
      typeof candidate.showLabels === "boolean" ? candidate.showLabels : true,
    showLinks:
      typeof candidate.showLinks === "boolean" ? candidate.showLinks : true,
    graphSettings: normalizeGraphSettings(candidate.graphSettings),
  };
}

export function useVisualPreferences() {
  const [preferences, setPreferences] = useState(() => {
    try {
      return normalizeVisualPreferences(
        JSON.parse(localStorage.getItem(KEY) ?? "null"),
      );
    } catch {
      return normalizeVisualPreferences(null);
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(preferences));
    } catch {
      /* Appearance remains usable when browser storage is unavailable. */
    }
  }, [preferences]);
  return { preferences, setPreferences };
}
