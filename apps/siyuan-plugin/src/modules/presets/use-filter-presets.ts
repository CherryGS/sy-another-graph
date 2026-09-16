import { useEffect, useRef, useState, type RefObject, type SetStateAction } from "react";
import type { GraphDataset } from "../../core/graph/types";
import type { GraphFilters } from "./filters";
import { getGraphLookups } from "../../core/graph/graph-lookups";
import { PresetClient } from "./client";
import { PresetController, initialPresetSnapshot } from "./controller";
import { applyPresetFilters, samePresetFilters } from "./model";

export function useFilterPresets(
  filters: GraphFilters,
  filtersRef: RefObject<GraphFilters>,
  ruleRevisionRef: RefObject<number>,
  data: GraphDataset | null,
  dataRef: RefObject<GraphDataset | null>,
  setFilters: (action: SetStateAction<GraphFilters>) => void,
) {
  const [snapshot, setSnapshot] = useState(initialPresetSnapshot);
  const controller = useRef<PresetController | null>(null);
  useEffect(() => {
    const current = new PresetController(
      new PresetClient(window),
      {
        getFilters: () => filtersRef.current,
        applyFilters: (rules) => setFilters((previous) => applyPresetFilters(previous, rules)),
        ruleRevision: () => ruleRevisionRef.current,
        sourceReady: () => dataRef.current !== null,
        validate: (rules) => {
          const data = dataRef.current;
          if (!data)
            return rules.scopeId || rules.notebook ? "请等待图谱数据读取完成后切换预设。" : "";
          if (rules.notebook && !data.notebooks.some((book) => book.id === rules.notebook))
            return "该预设的笔记本已不可用；当前范围保持不变。";
          if (rules.scopeId && !getGraphLookups(data).byId.has(rules.scopeId))
            return "该预设的范围已不可用；当前范围保持不变。";
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
  }, [dataRef, filtersRef, ruleRevisionRef, setFilters]);
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
    error: snapshot.error,
    presets: snapshot.store.presets,
    activeId: active?.id ?? null,
    activeName: active?.name ?? "自定义",
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
