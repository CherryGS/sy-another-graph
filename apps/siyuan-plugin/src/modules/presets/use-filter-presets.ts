import { message as msg } from "../../core/diagnostics/message";
import { useLocale } from "../../shared/i18n/react";
import { t, text } from "../../shared/i18n/runtime";
import { useEffect, useRef, useState, type RefObject, type SetStateAction } from "react";
import type { GraphDataset } from "../../core/graph/types";
import type { GraphFilters } from "./filters";
import { getGraphLookups } from "../../core/graph/graph-lookups";
import { PresetClient } from "./client";
import { PresetController, initialPresetSnapshot } from "./controller";
import { applyPresetFilters, samePresetFilters } from "./model";
import type { LayoutGrouping } from "../layout-groups/model";

export function useFilterPresets(
  filters: GraphFilters,
  filtersRef: RefObject<GraphFilters>,
  ruleRevisionRef: RefObject<number>,
  data: GraphDataset | null,
  dataRef: RefObject<GraphDataset | null>,
  setFilters: (action: SetStateAction<GraphFilters>) => void,
  legacyGrouping: LayoutGrouping,
) {
  useLocale();
  const [snapshot, setSnapshot] = useState(initialPresetSnapshot);
  const controller = useRef<PresetController | null>(null);
  useEffect(() => {
    const current = new PresetController(
      new PresetClient(window),
      {
        defaultName: () => t("text.documentReferences"),
        legacyGrouping: () => legacyGrouping,
        getFilters: () => filtersRef.current,
        applyFilters: (rules) => setFilters((previous) => applyPresetFilters(previous, rules)),
        ruleRevision: () => ruleRevisionRef.current,
        sourceReady: () => dataRef.current !== null,
        validate: (rules) => {
          const data = dataRef.current;
          if (!data)
            return rules.scopeId || rules.notebook
              ? msg("text.waitForTheGraphDataToFinishLoading")
              : "";
          if (rules.notebook && !data.notebooks.some((book) => book.id === rules.notebook))
            return msg("text.thePresetSNotebookIsUnavailableTheCurrent");
          if (rules.scopeId && !getGraphLookups(data).byId.has(rules.scopeId))
            return msg("text.thePresetSScopeIsUnavailableTheCurrent");
          return "";
        },
      },
      setSnapshot,
    );
    controller.current = current;
    void current.load(true);
    return () => {
      current.dispose();
      controller.current = null;
    };
  }, [dataRef, filtersRef, ruleRevisionRef, setFilters, legacyGrouping]);
  useEffect(() => {
    if (data) controller.current?.hydrate();
  }, [data]);
  const active = snapshot.store.presets.find(
    (preset) => preset.id === snapshot.store.activePresetId,
  );
  return {
    loading: snapshot.loading,
    saving: snapshot.saving,
    available: snapshot.available,
    error: text(snapshot.error),
    presets: snapshot.store.presets,
    activeId: active?.id ?? null,
    activeName:
      snapshot.loading && active?.id === "documents"
        ? t("text.documentReferences")
        : (active?.name ?? t("text.custom")),
    modified: !!active && !samePresetFilters(filters, active.filters),
    deleted: snapshot.deleted,
    retry: () => {
      void controller.current?.load();
    },
    apply: (id: string) => controller.current?.apply(id) ?? Promise.resolve(false),
    create: (name: string) => controller.current?.create(name) ?? Promise.resolve(false),
    copy: (id: string, name: string) =>
      controller.current?.copy(id, name) ?? Promise.resolve(false),
    rename: (id: string, name: string) =>
      controller.current?.rename(id, name) ?? Promise.resolve(false),
    remove: (id: string) => controller.current?.remove(id) ?? Promise.resolve(false),
    undoDelete: () => controller.current?.undoDelete() ?? Promise.resolve(false),
    update: () => controller.current?.update() ?? Promise.resolve(false),
    saveAs: (name: string) => controller.current?.saveAs(name) ?? Promise.resolve(false),
  };
}
