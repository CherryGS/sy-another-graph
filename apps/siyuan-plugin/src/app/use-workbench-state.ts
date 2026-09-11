import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { loadSiYuanGraph } from "../data/source";
import { prepareGraphExport, type ExportFile } from "../data/export";
import {
  DEFAULT_FILTERS,
  type GraphDataset,
  type GraphEdge,
  type GraphFilters,
} from "../data/types";
import {
  projectGraph,
  resolveOpenBlock,
  scopeBackground,
  createViewProjector,
  type CurrentGraph,
} from "../data/graph-model";
import { newSavedView, readSavedViews, type SavedView } from "../data/views";
import type { GraphColorMode } from "../graph/node-colors";
import type { GraphDirection } from "../engine/types";
import { EMPTY_SELECTION, retainSelection, restoreSelection, selectNode } from "./selection";
import { useGraphEngine } from "./use-graph-engine";
import { ExplorationRequest } from "./exploration-request";
import { SourceRefresh, subscribeSourceRefresh } from "./source-refresh";
import {
  normalizeVisualPreferences,
  useVisualPreferences,
} from "./visual-preferences";
import { normalizeGraphSettings, type GraphSettings } from "../graph/settings";
import { getGraphLookups, searchGraphNodes } from "../data/graph-lookups";
import { withMentionEdges } from "../mentions/graph-integration";
import { useMentions } from "./use-mentions";

const NATIVE_ID = /^\d{14}-[a-z0-9]{7}$/;
const CHANNEL = "sy-another-graph";
const emptyView = { nodes: [], edges: [] };

function userMessage(failure: unknown) {
  const message = failure instanceof Error ? failure.message : String(failure);
  if (/Graph worker failed|Failed to fetch/i.test(message))
    return "本地图谱资源加载失败，请确认思源连接正常后重试。";
  if (/timed out|timeout/i.test(message))
    return "请求超时，请检查连接后重新加载图谱。";
  return message;
}

interface ExplorationResult {
  kind: "neighborhood" | "path";
  graph: CurrentGraph;
  chosenKey: string;
  depth: number;
  direction: GraphDirection;
  indices: Set<number>;
  label: string;
}

export function useWorkbenchState() {
  const [data, setData] = useState<GraphDataset | null>(null);
  const dataRef = useRef<GraphDataset | null>(null);
  const [loading, setLoading] = useState("正在连接思源…");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [filters, setFiltersState] = useState<GraphFilters>(() => ({
    ...DEFAULT_FILTERS,
    excludeIds: [],
    hiddenTypes: [],
  }));
  const filtersRef = useRef(filters);
  const [selection, setSelection] = useState({ ...EMPTY_SELECTION });
  const [inspectedEdge, setInspectedEdge] = useState<{
    graph: CurrentGraph;
    edge: GraphEdge;
  } | null>(null);
  const [depth, setDepthState] = useState(1);
  const [direction, setDirection] = useState<GraphDirection>("both");
  const [exploration, setExploration] = useState<ExplorationResult | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const requests = useRef(new ExplorationRequest());
  const { preferences, setPreferences } = useVisualPreferences();
  const { showLabels, showLinks, pointSize, colorBy, graphSettings } =
    preferences;
  const setShowLabels = (showLabels: boolean) =>
    setPreferences((value) => ({ ...value, showLabels }));
  const setShowLinks = (showLinks: boolean) =>
    setPreferences((value) => ({ ...value, showLinks }));
  const setPointSize = (pointSize: number) =>
    setPreferences((value) =>
      normalizeVisualPreferences({ ...value, pointSize }),
    );
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
  const [savedViews, setSavedViews] = useState(readSavedViews);
  const [exporting, setExporting] = useState(false);
  const [exportFile, setExportFile] = useState<ExportFile | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const loadAbort = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const sourceRefresh = useRef<SourceRefresh | null>(null);

  const load = useCallback(async () => {
    const current = ++revision.current;
    const sourceVersion = sourceRefresh.current?.beginLoad() ?? 0;
    let succeeded = false;
    loadAbort.current?.abort();
    exportAbort.current?.abort();
    setExporting(false);
    setExportFile(null);
    const abort = new AbortController();
    loadAbort.current = abort;
    setError("");
    setLoading("准备图谱数据…");
    try {
      const next = await loadSiYuanGraph(abort.signal, (message) => {
        if (current === revision.current) setLoading(message);
      });
      if (current !== revision.current) return;
      const initial = dataRef.current === null;
      dataRef.current = next;
      setData(next);
      succeeded = true;
      if (initial) setFitRequest((value) => value + 1);
      return next;
    } catch (failure) {
      if (current === revision.current && !abort.signal.aborted)
        setError(userMessage(failure));
    } finally {
      if (current === revision.current) {
        setLoading("");
        sourceRefresh.current?.completeLoad(sourceVersion, succeeded);
      }
    }
  }, []);

  const dispose = useCallback(() => {
    revision.current++;
    loadAbort.current?.abort();
    exportAbort.current?.abort();
    requests.current.cancel();
  }, []);
  useEffect(() => {
    const refresh = new SourceRefresh(() => void load());
    sourceRefresh.current = refresh;
    const unsubscribe = subscribeSourceRefresh(window, refresh);
    // eslint-disable-next-line react/set-state-in-effect -- Synchronize the read-only external source snapshot.
    void load();
    return () => {
      unsubscribe();
      refresh.dispose();
      sourceRefresh.current = null;
      dispose();
    };
  }, [load, dispose]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const setFilters = useCallback((action: SetStateAction<GraphFilters>) => {
    const previous = filtersRef.current;
    const next = typeof action === "function" ? action(previous) : action;
    filtersRef.current = next;
    setFiltersState(next);
  }, []);

  const {
    notebook,
    references,
    hierarchy,
    excludeIds,
    hiddenTypes,
    databases,
    scopeId,
    includeChildDocuments,
  } = filters;
  const baseGraph = useMemo(
    () =>
      data
        ? projectGraph(data, {
            ...DEFAULT_FILTERS,
            notebook,
            references,
            hierarchy,
            excludeIds,
            hiddenTypes,
            databases,
            scopeId,
            includeChildDocuments,
          })
        : null,
    [
      data,
      notebook,
      references,
      hierarchy,
      excludeIds,
      hiddenTypes,
      databases,
      scopeId,
      includeChildDocuments,
    ],
  );
  const availableSelection = useMemo(
    () =>
      baseGraph
        ? retainSelection(selection, baseGraph.eligibleIds)
        : selection,
    [selection, baseGraph],
  );
  const chosenIds = availableSelection.chosenIds;
  const chosenKey = JSON.stringify(chosenIds);
  const chosenSet = useMemo(() => new Set(chosenIds), [chosenIds]);
  const mentionState = useMentions(data, baseGraph, filters.mentions, chosenIds);
  const mentionsPending = filters.mentions !== "off" && !mentionState.error
    && (filters.mentions !== "selected" || chosenIds.length > 0)
    && (!mentionState.ready || mentionState.pending);
  const currentGraph = useMemo(
    () => baseGraph ? withMentionEdges(baseGraph, mentionState.result.edges) : null,
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
        ? scopeBackground(
            data,
            currentGraph,
            filters.scopeId,
            filters.includeChildDocuments,
          )
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
    const pending = ownership.neighborhood(
      loaded.engine,
      seeds,
      direction,
      depth,
    );
    const requestToken = ownership.currentToken;
    void pending
      .then((result) => {
        if (!active || !result || ownership.currentToken !== requestToken)
          return;
        setExploration({
          kind: "neighborhood",
          graph: loaded.graph,
          chosenKey,
          direction,
          depth,
          indices: new Set(
            Array.from(
              result.indices,
              (index) => loaded.topology.denseToSource[index],
            ),
          ),
          label: `${depth} 跳 · ${direction === "out" ? "沿箭头" : direction === "in" ? "逆箭头" : "双向"}${result.truncated ? " · 已达邻域节点预算，结果已截断" : ""}`,
        });
      })
      .catch((failure: unknown) => {
        if (active && ownership.currentToken === requestToken) {
          setToast(userMessage(failure));
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
        ? viewProjector.project(
            backgroundIds,
            chosenSet,
            focus,
            filters.hideIsolated,
          )
        : emptyView,
    [viewProjector, backgroundIds, chosenSet, focus, filters.hideIsolated],
  );
  const sourceLookups = useMemo(
    () => (data ? getGraphLookups(data) : null),
    [data],
  );
  const currentLookups = useMemo(
    () => (currentGraph ? getGraphLookups(currentGraph) : null),
    [currentGraph],
  );
  const selectedId = availableSelection.inspectedId;
  const selected = selectedId
    ? (currentLookups?.byId.get(selectedId) ?? null)
    : null;
  const edge = useMemo(
    () =>
      inspectedEdge?.graph === currentGraph &&
      view.edges.includes(inspectedEdge.edge)
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

  const setSelectedId = (
    id: string | null,
    event?: { shiftKey: boolean; detail: number },
  ) => {
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
    if (Number.isSafeInteger(value) && value >= 0 && value <= 100)
      setDepthState(value);
  };
  const findPath = async (targetId: string) => {
    if (mentionsPending) { setToast("文本提及仍在计算，完成后可查找包含提及关系的路径。"); return; }
    const loadedGraph = engine.current;
    const target = currentGraph?.nodes.find(
      (node) => node.id === targetId || node.label === targetId,
    );
    const from = selected
      ? loadedGraph?.topology.idToDense.get(selected.id)
      : undefined;
    const to = target
      ? loadedGraph?.topology.idToDense.get(target.id)
      : undefined;
    if (
      !loadedGraph ||
      loadedGraph.graph !== currentGraph ||
      from == null ||
      to == null
    ) {
      setToast("请选择当前图中有效的起点和终点");
      return;
    }
    setBusy(true);
    const pendingPath = requests.current.path(
      loadedGraph.engine,
      from,
      to,
      direction,
    );
    const requestToken = requests.current.currentToken;
    try {
      const path = await pendingPath;
      if (!path || requests.current.currentToken !== requestToken) return;
      if (!path.length) {
        setToast("当前关系设置下没有连接路径");
        return;
      }
      setExploration({
        kind: "path",
        graph: loadedGraph.graph,
        chosenKey,
        depth,
        direction,
        indices: new Set(
          Array.from(
            path,
            (index) => loadedGraph.topology.denseToSource[index],
          ),
        ),
        label: `最短路径 · ${Math.max(0, path.length - 1)} 步`,
      });
    } catch (failure) {
      if (requests.current.currentToken === requestToken)
        setToast(userMessage(failure));
    } finally {
      if (requests.current.currentToken === requestToken) setBusy(false);
    }
  };
  const openDocument = (id: string) => {
    const nativeId =
      data && currentGraph ? resolveOpenBlock(id, data, currentGraph) : null;
    if (!nativeId || !NATIVE_ID.test(nativeId)) {
      setToast("该节点在当前范围内暂无可打开的原生上下文");
      return;
    }
    if (window.parent !== window)
      window.parent.postMessage(
        { channel: CHANNEL, type: "open-block", id: nativeId },
        window.location.origin,
      );
    else setToast("请从思源插件页签打开图谱，以跳转到原文");
  };

  useEffect(() => {
    const handleScope = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent ||
        window.parent === window
      )
        return;
      const message = event.data as {
        channel?: string;
        type?: string;
        id?: unknown;
      } | null;
      if (
        message?.channel !== CHANNEL ||
        message.type !== "scope-graph" ||
        typeof message.id !== "string" ||
        !NATIVE_ID.test(message.id)
      )
        return;
      const id = message.id;
      setFilters((previous) => ({ ...previous, scopeId: id }));
      setSelection({ ...EMPTY_SELECTION });
      setInspectedEdge(null);
      window.location.hash = "#/";
      window.parent.postMessage(
        { channel: CHANNEL, type: "scope-applied", id },
        window.location.origin,
      );
    };
    window.addEventListener("message", handleScope);
    return () => window.removeEventListener("message", handleScope);
  }, [setFilters]);

  const persistViews = (next: SavedView[]) => {
    if (next.length > 50) {
      setToast("最多保存 50 个视图，请先移除不需要的视图");
      return false;
    }
    try {
      localStorage.setItem("sy-another-graph:views", JSON.stringify(next));
      setSavedViews(next);
      return true;
    } catch {
      setToast("浏览器存储不可用，视图未保存");
      return false;
    }
  };
  const saveView = (name: string) => {
    if (
      data &&
      persistViews([newSavedView(name, filters, selectedId, { chosenIds, multiple: availableSelection.multiple }), ...savedViews])
    )
      setToast("视图已保存到当前浏览器");
  };
  const restoreView = async (saved: SavedView) => {
    const currentData = data ?? (await load());
    if (!currentData) return false;
    if (
      saved.filters.notebook &&
      !currentData.notebooks.some((book) => book.id === saved.filters.notebook)
    ) {
      setToast("该视图的笔记本已不可用，请重新选择探索范围。");
      return false;
    }
    if (
      saved.filters.scopeId &&
      !currentData.nodes.some((node) => node.id === saved.filters.scopeId)
    ) {
      setToast("该视图的范围块已不可用，请重新选择范围。");
      return false;
    }
    setFilters({ ...saved.filters });
    const nextGraph = projectGraph(currentData, saved.filters);
    const selectedExists =
      !saved.selectedId || nextGraph.eligibleIds.has(saved.selectedId);
    setSelection(restoreSelection(saved, nextGraph.eligibleIds));
    setInspectedEdge(null);
    setToast(
      selectedExists
        ? `已恢复「${saved.name}」`
        : "已恢复筛选条件；原选中节点已不在当前图谱中",
    );
    return true;
  };
  const exportGraph = async () => {
    if (!data || exporting) return;
    if (mentionsPending) { setToast("文本提及仍在计算，完成后可导出包含提及关系的图谱。"); return; }
    const current = revision.current;
    const abort = new AbortController();
    exportAbort.current = abort;
    setExporting(true);
    setExportFile(null);
    try {
      const file = await prepareGraphExport(view, abort.signal);
      if (current !== revision.current) return;
      setExportFile(file);
      setToast("JSON 文件已生成，点击「下载 JSON」保存");
    } catch (failure) {
      if (current === revision.current && !abort.signal.aborted)
        setToast(userMessage(failure));
    } finally {
      if (current === revision.current) setExporting(false);
    }
  };

  return {
    data,
    currentGraph,
    sourceLookups,
    currentLookups,
    stats: loaded?.stats ?? null,
    loading,
    error: error || engineError,
    toast,
    setToast,
    load,
    filters,
    setFilters,
    mentionState,
    selectedId,
    setSelectedId,
    selected,
    chosenIds,
    clearChosen,
    closeInspector: () =>
      setSelection((previous) => ({ ...previous, inspectedId: null })),
    inspectedEdge: edge,
    inspectEdge,
    closeEdge: () => setInspectedEdge(null),
    spotlightIds,
    focus,
    focusLabel: activeExploration?.label ?? "",
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
    busy: busy || (chosenIds.length > 0 && engineLoading) || mentionsPending,
    findPath,
    openDocument,
    nativeBlockId: (id: string) =>
      data && currentGraph ? resolveOpenBlock(id, data, currentGraph) : null,
    canOpen: (id: string) =>
      !!(data && currentGraph && resolveOpenBlock(id, data, currentGraph)),
    savedViews,
    persistViews,
    saveView,
    restoreView,
    exportGraph,
    exporting,
    exportFile,
    dismissExport: () => setExportFile(null),
  };
}
