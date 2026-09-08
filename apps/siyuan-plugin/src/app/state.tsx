import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createGraphEngine,
  type EngineStats,
  type GraphEngine,
} from "../engine/client";
import { createDemoGraph, loadSiYuanGraph } from "../data/source";
import { prepareGraphExport, type ExportFile } from "../data/export";
import type { GraphColorMode } from "../graph/node-colors";
import type { GraphDirection } from "../engine/types";
import {
  DEFAULT_FILTERS,
  type GraphDataset,
  type GraphFilters,
} from "../data/types";
import {
  filterGraph,
  newSavedView,
  readSavedViews,
  type SavedView,
} from "../data/views";

function userMessage(failure: unknown) {
  const message = failure instanceof Error ? failure.message : String(failure);
  if (/Graph worker failed|Failed to fetch/i.test(message))
    return "本地图谱资源加载失败，请确认思源连接正常后重试。";
  if (/timed out|timeout/i.test(message))
    return "请求超时，请检查连接后重新加载图谱。";
  return message;
}

function useWorkbenchState() {
  const [data, setData] = useState<GraphDataset | null>(null);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [source, setSource] = useState("siyuan");
  const [loading, setLoading] = useState("正在连接思源…");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [filters, setFilters] = useState<GraphFilters>({ ...DEFAULT_FILTERS });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<Set<number> | null>(null);
  const [focusLabel, setFocusLabel] = useState("");
  const [showLabels, setShowLabels] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [pointSize, setPointSize] = useState(4);
  const [colorBy, setColorBy] = useState<GraphColorMode>("branch");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [direction, setDirection] = useState<GraphDirection>("both");
  const [paused, setPaused] = useState(false);
  const [fitRequest, setFitRequest] = useState(0);
  const [savedViews, setSavedViews] = useState(readSavedViews);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFile, setExportFile] = useState<ExportFile | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const engine = useRef<GraphEngine | null>(null);
  const loadAbort = useRef<AbortController | null>(null);
  const revision = useRef(0);

  const load = useCallback(async (nextSource = "siyuan") => {
    const current = ++revision.current;
    loadAbort.current?.abort();
    exportAbort.current?.abort();
    setExporting(false);
    setExportFile(null);
    engine.current?.dispose();
    engine.current = null;
    const abort = new AbortController();
    loadAbort.current = abort;
    setSource(nextSource);
    setError("");
    setLoading("准备图谱数据…");
    setBusy(false);
    setFocus(null);
    setFocusLabel("");
    setSelectedId(null);
    setStats(null);
    setData(null);
    try {
      const next =
        nextSource === "siyuan"
          ? await loadSiYuanGraph(abort.signal, (message) => {
              if (current === revision.current) setLoading(message);
            })
          : createDemoGraph(Number(nextSource));
      if (current !== revision.current) return;
      setLoading(
        `正在构建 Rust 图索引 · ${next.nodes.length.toLocaleString()} 个节点`,
      );
      const nextEngine = createGraphEngine();
      engine.current = nextEngine;
      const endpoints = new Uint32Array(next.edges.length * 2);
      next.edges.forEach((edge, index) => {
        endpoints[index * 2] = edge.source;
        endpoints[index * 2 + 1] = edge.target;
      });
      const nextStats = await nextEngine.load(next.nodes.length, endpoints);
      if (current !== revision.current) return;
      next.nodes.forEach((node, index) => {
        node.degree = nextStats.degrees[index] ?? 0;
      });
      setData(next);
      setStats(nextStats);
      setFilters({ ...DEFAULT_FILTERS });
      setFitRequest((value) => value + 1);
      return next;
    } catch (failure) {
      if (current === revision.current && !abort.signal.aborted) {
        engine.current?.dispose();
        engine.current = null;
        setError(userMessage(failure));
      }
    } finally {
      if (current === revision.current) setLoading("");
    }
  }, []);

  const dispose = useCallback(() => {
    revision.current++;
    loadAbort.current?.abort();
    exportAbort.current?.abort();
    engine.current?.dispose();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Initial synchronization loads external SiYuan data and owns a Worker.
    void load();
    return dispose;
  }, [load, dispose]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const { notebook, references, hierarchy, hideIsolated } = filters;
  const view = useMemo(
    () =>
      data
        ? filterGraph(
            data,
            { query: "", notebook, references, hierarchy, hideIsolated },
            focus,
          )
        : { nodes: [], edges: [] },
    [data, notebook, references, hierarchy, hideIsolated, focus],
  );
  const selected = useMemo(
    () => data?.nodes.find((node) => node.id === selectedId) ?? null,
    [data, selectedId],
  );
  const results = useMemo(() => {
    const needle = filters.query.trim().toLocaleLowerCase();
    return needle
      ? view.nodes
          .filter(
            (node) =>
              node.label.toLocaleLowerCase().includes(needle) ||
              node.id.includes(needle),
          )
          .slice(0, 30)
      : [];
  }, [filters.query, view.nodes]);

  const clearFocus = () => {
    setFocus(null);
    setFocusLabel("");
    setFitRequest((value) => value + 1);
  };
  const neighborhood = async (depth: number) => {
    if (!selected || !engine.current) return;
    const current = revision.current;
    setBusy(true);
    try {
      const result = await engine.current.neighborhood(
        [selected.index],
        direction,
        depth,
        10000,
      );
      if (current !== revision.current) return;
      setFilters((previous) => ({
        ...previous,
        notebook: "",
        references: true,
        hierarchy: true,
        hideIsolated: false,
      }));
      setFocus(new Set(result.indices));
      setFocusLabel(
        `${depth} 跳 · ${direction === "out" ? "沿箭头" : direction === "in" ? "逆箭头" : "双向"}${result.truncated ? " · 已达 10,000 节点预算" : ""}`,
      );
      setFitRequest((value) => value + 1);
    } catch (failure) {
      if (current === revision.current) setToast(String(failure));
    } finally {
      if (current === revision.current) setBusy(false);
    }
  };
  const findPath = async (targetId: string) => {
    const target = data?.nodes.find(
      (node) => node.id === targetId || node.label === targetId,
    );
    if (!selected || !target || !engine.current) {
      setToast("请选择图谱中有效的起点和终点");
      return;
    }
    const current = revision.current;
    setBusy(true);
    try {
      const path = await engine.current.shortestPath(
        selected.index,
        target.index,
        direction,
      );
      if (current !== revision.current) return;
      if (!path.length) {
        setToast("这两个文档之间没有连接路径");
        return;
      }
      setFilters((previous) => ({
        ...previous,
        notebook: "",
        references: true,
        hierarchy: true,
        hideIsolated: false,
      }));
      setFocus(new Set(path));
      setFocusLabel(
        `最短路径 · ${Math.max(0, path.length - 1)} 步 · ${direction === "out" ? "沿箭头" : direction === "in" ? "逆箭头" : "双向"}`,
      );
      setFitRequest((value) => value + 1);
    } catch (failure) {
      if (current === revision.current) setToast(String(failure));
    } finally {
      if (current === revision.current) setBusy(false);
    }
  };
  const openDocument = (id: string) => {
    if (data?.source === "demo") {
      setToast("这是合成数据，不对应实际思源文档");
      return;
    }
    if (window.parent !== window)
      window.parent.postMessage(
        { channel: "sy-another-graph", type: "open-block", id },
        window.location.origin,
      );
    else setToast("请从思源插件页签打开图谱，以跳转到文档");
  };
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
    if (!data) return;
    if (savedViews.length >= 50) {
      setToast("最多保存 50 个视图，请先移除不需要的视图");
      return;
    }
    if (
      persistViews([
        newSavedView(
          name,
          filters,
          selectedId,
          data.source,
          source as SavedView["datasetKey"],
        ),
        ...savedViews,
      ])
    )
      setToast("视图已保存到当前浏览器");
  };
  const restoreView = async (saved: SavedView) => {
    const key =
      saved.datasetKey ?? (saved.source === "siyuan" ? "siyuan" : "10000");
    const currentData = key === source && data ? data : await load(key);
    if (!currentData) return false;
    if (
      saved.filters.notebook &&
      !currentData.notebooks.some((book) => book.id === saved.filters.notebook)
    ) {
      setToast("该视图的笔记本已不可用，请重新选择探索范围。");
      return false;
    }
    const selectedExists =
      !saved.selectedId ||
      currentData.nodes.some((node) => node.id === saved.selectedId);
    setFilters({ ...saved.filters });
    setSelectedId(selectedExists ? saved.selectedId : null);
    clearFocus();
    setToast(
      selectedExists
        ? `已恢复「${saved.name}」`
        : "已恢复筛选条件；原选中文档已不在当前图谱中",
    );
    return true;
  };
  const exportGraph = async () => {
    if (!data || exporting) return;
    const current = revision.current;
    const abort = new AbortController();
    exportAbort.current = abort;
    setExporting(true);
    setExportFile(null);
    try {
      const file = await prepareGraphExport(data.source, view, abort.signal);
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
    stats,
    source,
    loading,
    error,
    toast,
    setToast,
    load,
    filters,
    setFilters,
    selectedId,
    setSelectedId,
    selected,
    focus,
    focusLabel,
    clearFocus,
    view,
    results,
    showLabels,
    setShowLabels,
    showLinks,
    setShowLinks,
    pointSize,
    setPointSize,
    colorBy,
    setColorBy,
    filtersOpen,
    setFiltersOpen,
    direction,
    setDirection,
    paused,
    setPaused,
    fitRequest,
    fit: () => setFitRequest((value) => value + 1),
    busy,
    neighborhood,
    findPath,
    openDocument,
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

type WorkbenchState = ReturnType<typeof useWorkbenchState>;
const WorkbenchContext = createContext<WorkbenchState | null>(null);
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  return (
    <WorkbenchContext.Provider value={useWorkbenchState()}>
      {children}
    </WorkbenchContext.Provider>
  );
}
// eslint-disable-next-line react/only-export-components -- This context hook belongs to its provider; the plugin page has no fast-refresh runtime.
export function useWorkbench() {
  const state = useContext(WorkbenchContext);
  if (!state) throw new Error("Workbench provider missing");
  return state;
}
