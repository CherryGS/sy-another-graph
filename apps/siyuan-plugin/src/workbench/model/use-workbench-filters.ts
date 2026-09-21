import { useLocale } from "../../shared/i18n/react";
import { t } from "../../shared/i18n/runtime";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { GraphDataset } from "../../core/graph/types";
import { getGraphLookups } from "../../core/graph/graph-lookups";
import { searchAncestorIds } from "../../core/scope/graph-model";
import { FilterSessions } from "../../application/workflows/filter-sessions";
import { readSearchSnapshot } from "../../modules/search/model";
import { useFilterPresets } from "../../modules/presets/use-filter-presets";
import type { LayoutGrouping } from "../../modules/layout-groups/model";

const CHANNEL = "sy-another-graph";

export function useWorkbenchFilters(
  data: GraphDataset | null,
  dataRef: RefObject<GraphDataset | null>,
  onEntry: () => void,
  loading: string,
  reload: () => Promise<unknown>,
  legacyGrouping: LayoutGrouping,
) {
  useLocale();
  const [sessions] = useState(() => new FilterSessions());
  const state = useSyncExternalStore(sessions.subscribe, sessions.getSnapshot);
  const normal = useFilterPresets(
    state.normal,
    sessions.normalRef,
    sessions.ruleRevisionRef,
    data,
    dataRef,
    sessions.setNormal,
    legacyGrouping,
  );
  const temporary = state.active ? state.temporary : null;
  const search = temporary?.snapshot;
  const filters = temporary?.filters ?? state.normal;
  const matchedIds = temporary?.ids;
  const searchIds = useMemo(
    () => (data && matchedIds ? searchAncestorIds(data, matchedIds) : matchedIds),
    [data, matchedIds],
  );
  const missing = useMemo(() => {
    if (!search || !data) return [];
    const source = getGraphLookups(data).byId;
    return search.ids.filter((id) => !source.has(id));
  }, [search, data]);
  const retriedSearch = useRef<string | null>(null);
  useEffect(() => {
    // Reuse a fresh workspace snapshot. Only missing results justify a full
    // acquisition retry; changing a temporary filter never scans all hits again.
    if (!search || !missing.length || loading || retriedSearch.current === search.requestId) return;
    retriedSearch.current = search.requestId;
    void reload();
  }, [search, missing.length, loading, reload]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        window.parent === window ||
        event.source !== window.parent ||
        event.origin !== window.location.origin
      )
        return;
      const message = event.data;
      if (message?.channel !== CHANNEL) return;
      if (message.type === "search-graph") {
        const snapshot = readSearchSnapshot(message.snapshot);
        if (!snapshot) return;
        if (sessions.getSnapshot().temporary?.snapshot.requestId !== snapshot.requestId) {
          sessions.search(snapshot);
          onEntry();
        }
        window.parent.postMessage(
          { channel: CHANNEL, type: "search-applied", requestId: snapshot.requestId },
          window.location.origin,
        );
      } else if (
        message.type === "scope-graph" &&
        typeof message.id === "string" &&
        /^\d{14}-[a-z0-9]{7}$/.test(message.id)
      ) {
        sessions.scope(message.id);
        onEntry();
        window.parent.postMessage(
          { channel: CHANNEL, type: "scope-applied", id: message.id },
          window.location.origin,
        );
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [sessions, onEntry]);

  return {
    filters,
    setFilters: sessions.setFilters,
    resetFilters: sessions.reset,
    matchedIds,
    searchIds,
    searchScope: temporary
      ? t("text.searchValueMatchesAndAncestors", { p0: temporary.ids.size })
      : undefined,
    filterPresets: {
      ...normal,
      activeId: temporary ? null : normal.activeId,
      activeName: temporary
        ? t("text.searchValue", { p0: temporary.snapshot.label })
        : normal.activeName,
      modified: temporary ? false : normal.modified,
      temporary: state.temporary,
      temporaryActive: !!temporary,
      searchAncestorCount: searchIds && matchedIds ? searchIds.size - matchedIds.size : 0,
      missingSearchIds: missing,
      resumeSearch: () => {
        sessions.resume();
        onEntry();
      },
      leaveSearch: () => {
        sessions.leave();
        onEntry();
      },
      apply: (id: string) => {
        if (state.active && id === normal.activeId) {
          sessions.leave();
          onEntry();
          return Promise.resolve(true);
        }
        return sessions.switchNormal(() => normal.apply(id));
      },
      create: (name: string) => sessions.switchNormal(() => normal.create(name)),
      copy: (id: string, name: string) => sessions.switchNormal(() => normal.copy(id, name)),
      update: () => (temporary ? Promise.resolve(false) : normal.update()),
      saveAs: (name: string) => (temporary ? Promise.resolve(false) : normal.saveAs(name)),
    },
  };
}
