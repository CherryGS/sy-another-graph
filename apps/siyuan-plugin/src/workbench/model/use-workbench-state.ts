import { message as msg, failureOf, type Failure } from "../../core/diagnostics/message";
import { useLocale } from "../../shared/i18n/react";
import { explorationLabel } from "../presentation/exploration";
import {
  hasExplorationNotice,
  type ExplorationSummary,
} from "../../application/sessions/exploration-result";
import { userMessage } from "../presentation/errors";
import { useGraphExport } from "./use-graph-export";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useWorkbenchServices } from "./services";
import { sourceProgress } from "../presentation/source-progress";
import { type GraphEdge } from "../../core/graph/types";
import { DEFAULT_FILTERS } from "../../modules/presets/filters";
import {
  projectGraph,
  resolveOpenBlock,
  scopeBackground,
  createViewProjector,
  type CurrentGraph,
} from "../../core/scope/graph-model";
import type { GraphColorMode } from "../presentation/node-colors";
import type { GraphDirection } from "../../application/sessions/graph-engine";
import { EMPTY_SELECTION, retainSelection, selectNode } from "../../application/sessions/selection";
import { useGraphEngine } from "./use-graph-engine";
import { ExplorationRequest } from "../../application/sessions/exploration-request";
import { normalizeVisualPreferences, useVisualPreferences } from "./visual-preferences";
import { normalizeGraphSettings, type GraphSettings } from "../presentation/settings";
import { getGraphLookups, searchGraphNodes } from "../../core/graph/graph-lookups";
import { withMentionEdges } from "../../modules/mentions/graph-integration";
import { useMentions } from "../../modules/mentions/use-mentions";
import { useWorkbenchFilters } from "./use-workbench-filters";
import { useGraphTabState } from "./use-graph-tab-state";
import { buildSearchOrigins } from "../../modules/search/origins";

const NATIVE_ID = /^\d{14}-[a-z0-9]{7}$/;
const CHANNEL = "sy-another-graph";
const emptyView = { nodes: [], edges: [] };

type ExplorationResult = ExplorationSummary & {
  graph: CurrentGraph;
  chosenKey: string;
  depth: number;
  direction: GraphDirection;
  indices: Set<number>;
};

export function useWorkbenchState() {
  useLocale();
  const { workspace } = useWorkbenchServices();
  const source = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  const data = source.data;
  const dataRef = workspace.dataRef;
  const load = workspace.refresh;
  const loading = sourceProgress(
    source.progress ?? (!data && !source.error ? { phase: "preparing" } : null),
  );
  const error = source.error ? userMessage(source.error) : "";
  const [toast, setToast] = useState<Failure>("");
  const [selection, setSelection] = useState({ ...EMPTY_SELECTION });
  const [inspectedEdge, setInspectedEdge] = useState<{
    graph: CurrentGraph;
    edge: GraphEdge;
  } | null>(null);
  const [depth, setDepthState] = useState(1);
  const [direction, setDirection] = useState<GraphDirection>("both");
  const [exploration, setExploration] = useState<ExplorationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const requests = useRef(new ExplorationRequest());
  const { preferences, setPreferences } = useVisualPreferences();
  const { showLabels, showLinks, pointSize, colorBy, graphSettings } = preferences;
  const setShowLabels = (showLabels: boolean) =>
    setPreferences((value) => ({ ...value, showLabels }));
  const setShowLinks = (showLinks: boolean) => setPreferences((value) => ({ ...value, showLinks }));
  const setPointSize = (pointSize: number) =>
    setPreferences((value) => normalizeVisualPreferences({ ...value, pointSize }));
  const setColorBy = (colorBy: GraphColorMode) =>
    setPreferences((value) => ({ ...value, colorBy }));
  const setGraphSettings = (patch: Partial<GraphSettings>) =>
    setPreferences((value) => ({
      ...value,
      graphSettings: normalizeGraphSettings({
        ...value.graphSettings,
        ...patch,
      }),
    }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [fitRequest, setFitRequest] = useState(0);
  const [readIssuesOpen, setReadIssuesOpen] = useState(false);
  const fitted = useRef(false);
  useEffect(() => {
    if (!data || fitted.current) return;
    fitted.current = true;
    // eslint-disable-next-line react/set-state-in-effect -- Fit only the initial snapshot of this view.
    setFitRequest((value) => value + 1);
  }, [data]);
  useEffect(() => {
    const ownership = requests.current;
    return () => {
      ownership.cancel();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const enterGraph = useCallback(() => {
    requests.current.cancel();
    setSelection({ ...EMPTY_SELECTION });
    setInspectedEdge(null);
    setExploration(null);
    setBusy(false);
    setFitRequest((value) => value + 1);
    window.location.hash = "#/";
  }, []);
  const { filters, setFilters, resetFilters, filterPresets, matchedIds, searchIds, searchScope } =
    useWorkbenchFilters(data, dataRef, enterGraph, loading, load);
  const graphTabState = useGraphTabState(
    filters,
    data,
    filterPresets.activeName,
    filterPresets.modified,
    searchScope,
  );

  const {
    notebook,
    references,
    hierarchy,
    excludeIds,
    hiddenTypes,
    documentsOnly,
    databases,
    scopeId,
    includeChildDocuments,
  } = filters;
  const baseGraph = useMemo(
    () =>
      data
        ? projectGraph(
            data,
            {
              ...DEFAULT_FILTERS,
              notebook,
              references,
              hierarchy,
              excludeIds,
              hiddenTypes,
              documentsOnly,
              databases,
              scopeId,
              includeChildDocuments,
            },
            searchIds,
          )
        : null,
    [
      data,
      notebook,
      references,
      hierarchy,
      excludeIds,
      hiddenTypes,
      documentsOnly,
      databases,
      scopeId,
      includeChildDocuments,
      searchIds,
    ],
  );
  const searchOrigins = useMemo(
    () => (baseGraph && matchedIds ? buildSearchOrigins(baseGraph, matchedIds) : undefined),
    [baseGraph, matchedIds],
  );
  const availableSelection = useMemo(
    () => (baseGraph ? retainSelection(selection, baseGraph.eligibleIds) : selection),
    [selection, baseGraph],
  );
  const chosenIds = availableSelection.chosenIds;
  const chosenKey = useMemo(() => JSON.stringify(chosenIds), [chosenIds]);
  const chosenSet = useMemo(() => new Set(chosenIds), [chosenIds]);
  const mentionState = useMentions(
    data,
    baseGraph,
    filters.mentions,
    chosenIds,
    filters.excludedMentionPhrases,
    filters.excludedMentionPatterns,
  );
  const mentionsPending =
    filters.mentions !== "off" &&
    !mentionState.error &&
    (filters.mentions !== "selected" || chosenIds.length > 0) &&
    (!mentionState.ready || mentionState.pending);
  const currentGraph = useMemo(
    () => (baseGraph ? withMentionEdges(baseGraph, mentionState.result.edges) : null),
    [baseGraph, mentionState.result.edges],
  );
  const {
    loaded,
    current: engine,
    loading: engineLoading,
    error: engineError,
  } = useGraphEngine(currentGraph, setToast);

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Scope/source/type changes invalidate selections and pins against the same graph used for traversal.
    setSelection(availableSelection);
  }, [availableSelection]);

  const backgroundIds = useMemo(
    () =>
      data && currentGraph
        ? scopeBackground(data, currentGraph, filters.scopeId, filters.includeChildDocuments)
        : new Set<string>(),
    [data, currentGraph, filters.scopeId, filters.includeChildDocuments],
  );

  useEffect(() => {
    const ownership = requests.current;
    ownership.cancel();
    if (!loaded || !chosenIds.length) {
      // eslint-disable-next-line react/set-state-in-effect -- Cancel busy state belonging to an obsolete graph query.
      setBusy(false);
      return;
    }
    let active = true;
    const seeds = chosenIds
      .map((id) => loaded.topology.idToDense.get(id))
      .filter((index): index is number => index !== undefined);
    // eslint-disable-next-line react/set-state-in-effect -- Reflect an asynchronous graph computation.
    setBusy(true);
    const pending = ownership.neighborhood(loaded.engine, seeds, direction, depth);
    const requestToken = ownership.currentToken;
    void pending
      .then((result) => {
        if (!active || !result || ownership.currentToken !== requestToken) return;
        setExploration({
          kind: "neighborhood",
          graph: loaded.graph,
          chosenKey,
          direction,
          depth,
          indices: new Set(
            Array.from(result.indices, (index) => loaded.topology.denseToSource[index]),
          ),
          truncated: result.truncated,
        });
      })
      .catch((failure: unknown) => {
        if (active && ownership.currentToken === requestToken) {
          setToast(failureOf(failure));
          // A failed replacement must not silently keep a different hop/direction result.
          setExploration((previous) =>
            previous?.graph === loaded.graph &&
            previous.chosenKey === chosenKey &&
            previous.kind === "neighborhood" &&
            (previous.depth !== depth || previous.direction !== direction)
              ? null
              : previous,
          );
        }
      })
      .finally(() => {
        if (active && ownership.currentToken === requestToken) setBusy(false);
      });
    return () => {
      active = false;
      ownership.cancel();
    };
  }, [loaded, chosenIds, chosenKey, direction, depth]);

  const activeExploration =
    exploration?.graph === currentGraph &&
    exploration.chosenKey === chosenKey &&
    (exploration.kind === "neighborhood" ||
      (exploration.depth === depth && exploration.direction === direction))
      ? exploration
      : null;
  const viewProjector = useMemo(
    () => (currentGraph ? createViewProjector(currentGraph) : null),
    [currentGraph],
  );
  const focus =
    chosenIds.length || activeExploration?.kind === "path"
      ? (activeExploration?.indices ?? null)
      : null;
  const view = useMemo(
    () =>
      viewProjector
        ? viewProjector.project(backgroundIds, chosenSet, focus, filters.hideIsolated)
        : emptyView,
    [viewProjector, backgroundIds, chosenSet, focus, filters.hideIsolated],
  );
  const sourceLookups = useMemo(() => (data ? getGraphLookups(data) : null), [data]);
  const currentLookups = useMemo(
    () => (currentGraph ? getGraphLookups(currentGraph) : null),
    [currentGraph],
  );
  const selectedId = availableSelection.inspectedId;
  const selected = selectedId ? (currentLookups?.byId.get(selectedId) ?? null) : null;
  const edge = useMemo(
    () =>
      inspectedEdge?.graph === currentGraph && view.edges.includes(inspectedEdge.edge)
        ? inspectedEdge.edge
        : null,
    [inspectedEdge, currentGraph, view.edges],
  );
  const spotlightIds = useMemo(
    () =>
      edge && currentLookups
        ? [...new Set([edge.source, edge.target])].flatMap((index) => {
            const node = currentLookups.byIndex.get(index);
            return node ? [node.id] : [];
          })
        : [],
    [edge, currentLookups],
  );
  const deferredQuery = useDeferredValue(filters.query);
  const results = useMemo(
    () => searchGraphNodes({ nodes: view.nodes }, deferredQuery),
    [deferredQuery, view.nodes],
  );

  const setSelectedId = (id: string | null, event?: { shiftKey: boolean; detail: number }) => {
    if (id && !currentGraph?.eligibleIds.has(id)) return;
    setInspectedEdge(null);
    setSelection((previous) => selectNode(previous, id, event?.shiftKey));
  };
  const clearChosen = () => {
    requests.current.cancel();
    setSelection({ ...EMPTY_SELECTION });
    setInspectedEdge(null);
    setExploration(null);
    setBusy(false);
  };
  const inspectEdge = (edge: GraphEdge) => {
    if (!currentGraph || !view.edges.includes(edge)) return;
    setInspectedEdge({ graph: currentGraph, edge });
  };
  const setDepth = (value: number) => {
    if (Number.isSafeInteger(value) && value >= 0 && value <= 100) setDepthState(value);
  };
  const findPath = async (targetId: string) => {
    if (source.refreshing) {
      setToast(msg("text.sourceDataIsUpdatingWaitBeforeFindingA"));
      return;
    }
    if (mentionsPending) {
      setToast(msg("text.textMentionsAreStillBeingCalculatedPathsIncluding"));
      return;
    }
    const loadedGraph = engine.current;
    const target = currentGraph?.nodes.find(
      (node) => node.id === targetId || node.label === targetId,
    );
    const from = selected ? loadedGraph?.topology.idToDense.get(selected.id) : undefined;
    const to = target ? loadedGraph?.topology.idToDense.get(target.id) : undefined;
    if (!loadedGraph || loadedGraph.graph !== currentGraph || from == null || to == null) {
      setToast(msg("text.selectValidStartAndEndNodesInThe"));
      return;
    }
    setBusy(true);
    const pendingPath = requests.current.path(loadedGraph.engine, from, to, direction);
    const requestToken = requests.current.currentToken;
    try {
      const path = await pendingPath;
      if (!path || requests.current.currentToken !== requestToken) return;
      if (!path.length) {
        setToast(msg("text.noPathExistsUnderTheCurrentRelationshipSettings"));
        return;
      }
      setExploration({
        kind: "path",
        graph: loadedGraph.graph,
        chosenKey,
        depth,
        direction,
        indices: new Set(Array.from(path, (index) => loadedGraph.topology.denseToSource[index])),
        steps: Math.max(0, path.length - 1),
      });
    } catch (failure) {
      if (requests.current.currentToken === requestToken) setToast(failureOf(failure));
    } finally {
      if (requests.current.currentToken === requestToken) setBusy(false);
    }
  };
  const openNativeBlock = (nativeId: string | null) => {
    if (!nativeId || !NATIVE_ID.test(nativeId)) {
      setToast(msg("text.thisNodeHasNoNativeContextAvailableIn"));
      return;
    }
    if (window.parent !== window)
      window.parent.postMessage(
        { channel: CHANNEL, type: "open-block", id: nativeId },
        window.location.origin,
      );
    else setToast(msg("text.openTheGraphInASiyuanPluginTab2"));
  };
  const openDocument = (id: string) =>
    openNativeBlock(data && currentGraph ? resolveOpenBlock(id, data, currentGraph) : null);
  const openReadIssueSource = (id: string) => {
    const node = sourceLookups?.byId.get(id);
    openNativeBlock(node?.entity === "block" ? node.id : null);
  };

  const graphExport = useGraphExport(data, view, source.refreshing, mentionsPending, setToast);

  return {
    data,
    currentGraph,
    sourceLookups,
    backgroundIds,
    currentLookups,
    loading,
    error: error || engineError,
    toast: toast ? userMessage(toast) : "",
    setToast,
    load,
    filters,
    setFilters,
    resetFilters,
    filterPresets,
    searchOrigins,
    graphTabState,
    mentionState,
    selectedId,
    setSelectedId,
    selected,
    chosenIds,
    clearChosen,
    closeInspector: () => setSelection((previous) => ({ ...previous, inspectedId: null })),
    inspectedEdge: edge,
    inspectEdge,
    closeEdge: () => setInspectedEdge(null),
    spotlightIds,
    focus,
    focusLabel: explorationLabel(activeExploration),
    showFocusNotice: hasExplorationNotice(activeExploration),
    view,
    results,
    depth,
    setDepth,
    showLabels,
    setShowLabels,
    showLinks,
    setShowLinks,
    pointSize,
    setPointSize,
    colorBy,
    setColorBy,
    graphSettings,
    setGraphSettings,
    resetAppearance: () => setPreferences(normalizeVisualPreferences(null)),
    filtersOpen,
    setFiltersOpen,
    direction,
    setDirection,
    paused,
    setPaused,
    fitRequest,
    fit: () => setFitRequest((value) => value + 1),
    busy: source.refreshing || busy || (chosenIds.length > 0 && engineLoading) || mentionsPending,
    findPath,
    openDocument,
    nativeBlockId: (id: string) =>
      data && currentGraph ? resolveOpenBlock(id, data, currentGraph) : null,
    canOpen: (id: string) => !!(data && currentGraph && resolveOpenBlock(id, data, currentGraph)),
    ...graphExport,
    readIssuesOpen,
    setReadIssuesOpen,
    openReadIssueSource,
  };
}
