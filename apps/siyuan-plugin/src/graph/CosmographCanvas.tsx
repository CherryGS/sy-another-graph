import { Cosmograph } from "@cosmograph/cosmograph";
import type { CosmographConfig } from "@cosmograph/cosmograph";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createLocalDuckDB } from "./local-duckdb";
import type { LocalDuckDB } from "./local-duckdb";
import { prepareGraph } from "./prepare-graph";
import type { PreparedGraph } from "./prepare-graph";
import { GraphTableStore } from "./graph-tables";
import { RendererSession } from "./renderer-session";
import type { CosmographCanvasProps } from "./types";
import "./canvas.css";

export type {
  CanvasNode,
  CanvasEdge,
  CanvasStats,
  CosmographCanvasProps,
} from "./types";

const BASE_CONFIG: CosmographConfig = {
  backgroundColor: "#11121a",
  enableSimulation: true,
  selectPointOnClick: false,
  selectPointOnLabelClick: false,
  selectLinkOnClick: false,
  focusPointOnClick: false,
  focusPointOnLabelClick: false,
  resetSelectionOnEmptyCanvasClick: false,
  preservePointPositionsOnDataUpdate: true,
  // The local text tooltip avoids upstream hover labels' untracked SQL/DOM continuations.
  showHoveredPointLabel: false,
  showDynamicLabels: true,
  showDynamicLabelsLimit: 40,
  showTopLabels: false,
  pointLabelColor: "#dce9f6",
  pointLabelFontSize: 12,
  pointLabelClassName: "ag-graph-label",
  focusedPointRingColor: "#effaff",
  renderHoveredPointRing: true,
  hoveredPointRingColor: "#9addf4",
  pointDefaultColor: "#8bd6e6",
  pointGreyoutOpacity: 0.15,
  linkGreyoutOpacity: 0.05,
  linkOpacity: 0.5,
  linkDefaultWidth: 0.8,
  curvedLinks: false,
  simulationRepulsion: 0.8,
  simulationLinkDistance: 12,
  simulationGravity: 0.12,
  simulationFriction: 0.85,
  fitViewOnInit: false,
  fitViewPadding: 0.15,
  statusIndicatorMode: false,
  disableLogging: true,
};

// Rapid empty-view/remount cycles finish releasing the previous GPU and worker first.
let previousCleanup: Promise<void> = Promise.resolve();
const errorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "无法绘制图谱，请重试。";
const reportCleanupError = (error: unknown) =>
  console.error("Graph resource cleanup failed", error);

export function CosmographCanvas(props: CosmographCanvasProps) {
  const {
    nodes,
    edges,
    selectedId,
    showLabels,
    showLinks,
    pointSize,
    paused,
    fitRequest,
  } = props;
  const container = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 12, y: 12 });
  const latestProps = useRef(props);
  const owner = useRef<RendererSession | null>(null);
  const interactiveConfig = useRef<CosmographConfig>({});
  const [session, setSession] = useState<RendererSession | null>(null);
  const [prepared, setPrepared] = useState<PreparedGraph | null>(null);
  const [counts, setCounts] = useState({ nodes: 0, links: 0 });
  const [isPreparing, setIsPreparing] = useState(true);
  const [isRendering, setIsRendering] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useLayoutEffect(() => {
    latestProps.current = props;
  });

  const positionTooltip = () => {
    const element = tooltip.current;
    const host = container.current;
    if (!element || !host) return;
    element.style.left = `${Math.max(8, Math.min(pointer.current.x + 12, host.clientWidth - element.offsetWidth - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(pointer.current.y + 12, host.clientHeight - element.offsetHeight - 8))}px`;
  };
  useLayoutEffect(positionTooltip, [hovered]);

  useEffect(() => {
    const controller = new AbortController();
    const priorCleanup = previousCleanup;
    let database: LocalDuckDB | undefined;
    let owned: RendererSession | undefined;
    let active = true;
    // eslint-disable-next-line react/set-state-in-effect -- Mirror the lifetime of an external GPU/worker resource.
    setSession(null);
    setCounts({ nodes: 0, links: 0 });
    setInitializationError(null);
    setError(null);
    const element = container.current;
    const fail = (failure: unknown) => {
      if (active) {
        setError(errorMessage(failure));
        setIsRendering(false);
        setHovered(null);
      }
    };
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      owned?.suspend();
      if (active)
        setInitializationError("图形上下文已丢失，请重试图谱以恢复显示。");
    };
    element?.addEventListener("webglcontextlost", handleContextLost, true);
    const initialize = async () => {
      try {
        await priorCleanup;
        if (!active) return;
        database = await createLocalDuckDB(controller.signal);
        if (!active || !element) {
          await database.dispose();
          return;
        }
        const choose = (id: string | null, event: MouseEvent) => {
          if (!active || !owned?.isInteractive) return;
          if (id !== null && !owned.displayed?.idToIndex.has(id)) return;
          latestProps.current.onSelect(id);
          if (id && event.detail === 2) latestProps.current.onOpen(id);
        };
        const base: CosmographConfig = {
          ...BASE_CONFIG,
          onClick: (index, _position, event) =>
            choose(
              index === undefined
                ? null
                : (owned?.displayed?.indexToId[index] ?? null),
              event,
            ),
          // Use the returned stable ID; an old asynchronous label click must not remap its index.
          onLabelClick: (_index, id, event) => choose(id, event),
          onPointMouseOver: (index) => {
            if (active && owned?.isInteractive)
              setHovered(owned.displayed?.indexToLabel[index] ?? null);
          },
          onPointMouseOut: () => {
            if (active) setHovered(null);
          },
          onGraphRebuildError: fail,
        };
        interactiveConfig.current = base;
        const graph = new Cosmograph(element, base, database);
        owned = new RendererSession(
          graph,
          new GraphTableStore(database.connection),
          database.drain,
          database.dispose,
          fail,
        );
        owner.current = owned;
        await owned.initialize(base);
        if (active) setSession(owned);
      } catch (failure) {
        if (active && !controller.signal.aborted)
          setInitializationError(errorMessage(failure));
        if (owned) await owned.dispose().catch(reportCleanupError);
        else await database?.dispose();
      }
    };
    const initializing = initialize();
    return () => {
      active = false;
      controller.abort();
      element?.removeEventListener("webglcontextlost", handleContextLost, true);
      const closing = owned?.dispose(); // Invalidates controls synchronously, destruction stays queued.
      if (owner.current === owned) owner.current = null;
      previousCleanup = (async () => {
        await closing;
        await initializing;
        if (owned) await owned.dispose();
        else await database?.dispose();
      })().catch(reportCleanupError);
    };
  }, [retry]);

  useEffect(() => {
    const controller = new AbortController();
    owner.current?.suspend();
    // eslint-disable-next-line react/set-state-in-effect -- Publish the external renderer's preparation state.
    setIsPreparing(true);
    setPrepared(null);
    setError(null);
    setHovered(null);
    void prepareGraph(nodes, edges, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setPrepared(result);
          setIsPreparing(false);
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(failure));
          setIsPreparing(false);
        }
      });
    return () => controller.abort();
  }, [nodes, edges, retry]);

  useEffect(() => {
    if (!session || !prepared) return;
    let active = true;
    // eslint-disable-next-line react/set-state-in-effect -- Controls stay disabled while the external GPU configuration is changing.
    setIsRendering(true);
    setHovered(null);
    session.controls(
      latestProps.current.selectedId,
      latestProps.current.paused,
    );
    void session
      .update(prepared, {
        ...interactiveConfig.current,
        showLabels,
        renderLinks: showLinks,
        linkOpacity: prepared.pointsCount > 20_000 ? 0.2 : 0.65,
        pointSizeRange: [Math.max(1, pointSize), Math.max(2, pointSize * 2.8)],
      })
      .then((stats) => {
        if (!active || !stats) return;
        setCounts({ nodes: stats.pointsCount, links: stats.linksCount });
        setIsRendering(false);
        setError(null);
        latestProps.current.onReady?.(stats);
      })
      .catch((failure: unknown) => {
        if (active) {
          setCounts(session.counts);
          setIsRendering(false);
          setError(errorMessage(failure));
        }
      });
    return () => {
      active = false;
      session.suspend();
    };
  }, [session, prepared, showLabels, showLinks, pointSize]);

  useEffect(() => {
    session?.controls(selectedId, paused);
  }, [session, selectedId, paused]);
  useEffect(() => {
    session?.fit();
  }, [session, fitRequest]);

  const loading = isPreparing || isRendering || !session;
  const visibleError = initializationError ?? error;
  return (
    <div
      className="ag-canvas"
      aria-label="交互式知识图谱"
      aria-busy={loading && !visibleError}
      data-rendered-nodes={counts.nodes}
      data-rendered-links={counts.links}
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        pointer.current = {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        };
        positionTooltip();
      }}
      onPointerLeave={() => setHovered(null)}
    >
      <div
        ref={container}
        className="ag-canvas__renderer"
        style={{ pointerEvents: loading || visibleError ? "none" : "auto" }}
      />
      {hovered && !loading && !visibleError && (
        <div ref={tooltip} className="ag-canvas__tooltip" role="tooltip">
          {hovered}
        </div>
      )}
      {visibleError ? (
        <div className="ag-canvas__state ag-canvas__state--error" role="alert">
          <strong>图谱暂时无法显示</strong>
          <span>{visibleError}</span>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            重试图谱
          </button>
        </div>
      ) : loading ? (
        <div className="ag-canvas__state" role="status">
          <span className="ag-canvas__spinner" aria-hidden="true" />
          <strong>
            {!session
              ? "正在启动图谱引擎"
              : isPreparing
                ? "正在准备图谱数据"
                : "正在绘制知识连接"}
          </strong>
          <span>{nodes.length.toLocaleString()} 个节点 · 在本机处理</span>
        </div>
      ) : nodes.length === 0 ? (
        <div className="ag-canvas__state" role="status">
          <strong>当前范围中没有节点</strong>
          <span>调整筛选条件，探索更多笔记。</span>
        </div>
      ) : null}
    </div>
  );
}
