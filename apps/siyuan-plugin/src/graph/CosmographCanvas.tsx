import { Cosmograph } from "@cosmograph/cosmograph";
import type { CosmographConfig } from "@cosmograph/cosmograph";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createLocalDuckDB } from "./local-duckdb";
import type { LocalDuckDB } from "./local-duckdb";
import { prepareGraph } from "./prepare-graph";
import type { PreparedGraph } from "./prepare-graph";
import { GraphTableStore } from "./graph-tables";
import { RendererSession } from "./renderer-session";
import { DragLabelGuard } from "./drag-label-guard";
import { CanvasGestures } from "./canvas-gestures";
import { ChosenLabels } from "./chosen-labels";
import { CommunityBackground } from "./community-background";
import { useCommunities } from "./use-communities";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { beginCanvasGroupMotion } from "./position-adapter";
import { DEFAULT_GRAPH_SETTINGS } from "./settings";
import { displayConfig } from "./display-config";
import { GraphCanvasState } from "./GraphCanvasState";
import { nodeContext } from "./node-context";
import { canvasClick } from "./canvas-click";
import { hitTestPoint } from "./point-hit-test";
import type { CanvasNode, CosmographCanvasProps } from "./types";
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
  enableDrag: true,
  selectPointOnClick: false,
  selectPointOnLabelClick: false,
  selectLinkOnClick: false,
  focusPointOnClick: false,
  focusPointOnLabelClick: false,
  resetSelectionOnEmptyCanvasClick: false,
  // RendererSession restores stable-ID coordinates and the public 2D viewport.
  preservePointPositionsOnDataUpdate: false,
  // The local text tooltip avoids upstream hover labels' untracked SQL/DOM continuations.
  showHoveredPointLabel: false,
  showDynamicLabels: true,
  showUnselectedPointLabels: false,
  showSelectedLabels: true,
  showTopLabels: false,
  pointLabelColor: "#dce9f6",
  pointLabelFontSize: 12,
  pointLabelClassName: "ag-graph-label",
  // Only unchosen inspection receives this accent; chosen roots retain equal outlines.
  focusedPointRingColor: "#f8cc84",
  outlinedPointRingColor: "#effaff",
  renderHoveredPointRing: true,
  hoveredPointRingColor: "#9addf4",
  pointDefaultColor: "#8bd6e6",
  pointGreyoutColor: "#526078",
  pointGreyoutOpacity: 0.28,
  linkGreyoutOpacity: 0.035,
  linkOpacity: 0.88,
  linkDefaultWidth: 1.55,
  linkDefaultArrows: true,
  linkArrowsSizeScale: 2.6,
  linkDashLength: 7,
  linkDashGap: 5,
  // Cosmos otherwise fades links longer than 150px to 25%, including their arrowheads.
  linkVisibilityDistanceRange: [200, 700],
  linkVisibilityMinTransparency: 0.8,
  curvedLinks: false,
  simulationRepulsion: 0.8,
  simulationLinkDistance: 12,
  simulationGravity: 0.12,
  simulationFriction: 0.85,
  // Keep the world extent fixed for this renderer across every later configuration.
  spaceSize: 8192,
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
const subscribeNothing = () => () => {};
const noDiagnostics = () => null;

export function CosmographCanvas(props: CosmographCanvasProps) {
  const {
    nodes,
    edges,
    selectedId,
    chosenIds,
    highlightedIds,
    spotlightIds,
    active: visible = true,
    colorBy = "type",
    settings = DEFAULT_GRAPH_SETTINGS,
    showLabels,
    showLinks,
    pointSize,
    paused,
    fitRequest,
  } = props;
  const container = useRef<HTMLDivElement>(null);
  const communityCanvas = useRef<HTMLCanvasElement>(null);
  const communityBackground = useRef<CommunityBackground | null>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 12, y: 12 });
  const latestProps = useRef(props);
  const owner = useRef<RendererSession | null>(null);
  const dragLabels = useRef<DragLabelGuard | null>(null);
  const chosenLabels = useRef<ChosenLabels | null>(null);
  const gestures = useRef<CanvasGestures | null>(null);
  const previousChosen = useRef<readonly string[]>([]);
  const hoveredLink = useRef<number | undefined>(undefined);
  const interactiveConfig = useRef<CosmographConfig>({});
  const [session, setSession] = useState<RendererSession | null>(null);
  const diagnostics = useSyncExternalStore(
    session?.subscribe ?? subscribeNothing,
    session?.getDiagnostics ?? noDiagnostics,
  );
  const [prepared, setPrepared] = useState<PreparedGraph | null>(null);
  const communities = useCommunities(prepared, settings.communityEnabled, settings.communityResolution);
  const [counts, setCounts] = useState({ nodes: 0, links: 0 });
  const [isPreparing, setIsPreparing] = useState(true);
  const [isRendering, setIsRendering] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<CanvasNode | null>(null);
  const context = hovered ? nodeContext(hovered, props.notebookNames) : null;
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
    let labels: ChosenLabels | undefined;
    let background: CommunityBackground | undefined;
    let interaction: CanvasGestures | undefined;
    let active = true;
    // eslint-disable-next-line react/set-state-in-effect -- Mirror the lifetime of an external GPU/worker resource.
    setSession(null);
    setCounts({ nodes: 0, links: 0 });
    setInitializationError(null);
    setError(null);
    const element = container.current;
    const labelGuard = element ? new DragLabelGuard(element) : null;
    dragLabels.current = labelGuard;
    const fail = (failure: unknown) => {
      interaction?.cancel();
      labels?.setActive(false);
      background?.setActive(false);
      labelGuard?.end();
      if (active) {
        setError(errorMessage(failure));
        setIsRendering(false);
        setHovered(null);
      }
    };
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      interaction?.cancel();
      labels?.setActive(false);
      background?.setActive(false);
      labelGuard?.end();
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
          // The capture listener owns Shift-double-click exit, and link clicks own edge inspection.
          if (id === null && hoveredLink.current !== undefined) return;
          const action = canvasClick(id, event);
          if (action.kind === "open") latestProps.current.onOpen(action.id);
          else if (action.kind === "inspect")
            latestProps.current.onSelect(action.id, action.event);
        };
        const refreshStoppedLabels = () => {
          if (active && owned?.isInteractive) {
            labels?.refreshAfterSimulation();
            background?.settle();
          }
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
          onLinkClick: (index) => {
            const edge = owned?.displayed?.indexToEdge[index];
            if (edge && active && owned?.isInteractive)
              latestProps.current.onInspectEdge(edge);
          },
          onLinkMouseOver: (index) => {
            hoveredLink.current = index;
          },
          onLinkMouseOut: () => {
            hoveredLink.current = undefined;
          },
          onPointMouseOver: (index) => {
            hoveredLink.current = undefined;
            if (active && owned?.isInteractive)
              setHovered(owned.displayed?.indexToNode[index] ?? null);
          },
          onPointMouseOut: () => {
            if (active) setHovered(null);
          },
          // Native start is synchronous: labels must stop intercepting the very next move.
          onDragStart: () => {
            labelGuard?.begin();
            setHovered(null);
          },
          onDrag: () => { labels?.refresh(); background?.refresh(); },
          onDragEnd: () => {
            labelGuard?.end();
            labels?.refresh();
            background?.settle();
          },
          onSimulationTick: () => { labels?.refresh("simulation"); background?.refresh("simulation"); },
          onSimulationPause: refreshStoppedLabels,
          onSimulationEnd: refreshStoppedLabels,
          onZoom: () => { labels?.refresh("projection"); background?.refresh("projection"); },
          onResize: () => { labels?.refresh("projection"); background?.refresh("projection"); },
          pointLabelClassName: (_text, _index, id) =>
            id &&
              (latestProps.current.chosenIds.includes(id) ||
                latestProps.current.spotlightIds?.includes(id))
              ? "ag-graph-label ag-graph-label--chosen"
              : "ag-graph-label",
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
        labels = new ChosenLabels(element, graph, choose, setHovered);
        chosenLabels.current = labels;
        if (communityCanvas.current) {
          background = new CommunityBackground(communityCanvas.current, graph);
          communityBackground.current = background;
        }
        const localPosition = (event: MouseEvent): [number, number] => {
          const bounds = (graph.getCanvas() ?? element).getBoundingClientRect();
          return [event.clientX - bounds.left, event.clientY - bounds.top];
        };
        const nodeAt = (event: MouseEvent) => {
          const target = event.target instanceof Element ? event.target : null;
          const label = target?.closest<HTMLElement>("[data-graph-node-id]");
          const labelId = label?.dataset.graphNodeId;
          if (labelId && owned?.displayed?.idToIndex.has(labelId))
            return labelId;
          if (target?.closest(".css-label--label")) return null;
          const index = hitTestPoint(graph, localPosition(event));
          return index === undefined ? null : (owned?.displayed?.indexToId[index] ?? null);
        };
        interaction = new CanvasGestures(element, {
          active: () => active && Boolean(owned?.isInteractive),
          chosenIds: () => latestProps.current.chosenIds,
          nodeAt,
          overRelationship: (event) =>
            hoveredLink.current !== undefined ||
            (event.target instanceof Element &&
              Boolean(event.target.closest(".css-label--label"))),
          pointerPosition: localPosition,
          begin: (ids, origin, grabbedId) => {
            const displayed = owned?.displayed;
            if (!displayed) throw new Error("图谱尚未就绪。");
            const indices = ids.map((id) => displayed.idToIndex.get(id));
            if (indices.some((index) => index === undefined))
              throw new Error("选中节点已变化，请重新开始拖动。");
            const grabbedIndex = displayed.idToIndex.get(grabbedId);
            if (grabbedIndex === undefined) throw new Error("拖动节点已变化，请重新开始拖动。");
            return beginCanvasGroupMotion(graph, indices as number[], grabbedIndex, origin, owned!.positionDimensions);
          },
          onStart: () => {
            labelGuard?.begin();
            setHovered(null);
          },
          onMove: () => { labels?.refresh(); background?.refresh(); },
          onEnd: (moved) => {
            labelGuard?.end();
            labels?.refresh();
            background?.settle();
            owned?.groupDragFinished(moved);
          },
          onClearChosen: () => latestProps.current.onClearChosen(),
          onError: fail,
        });
        gestures.current = interaction;
        owner.current = owned;
        owned.setActive(latestProps.current.active ?? true);
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
      interaction?.dispose();
      labels?.dispose();
      background?.dispose();
      if (communityBackground.current === background) communityBackground.current = null;
      if (gestures.current === interaction) gestures.current = null;
      if (chosenLabels.current === labels) chosenLabels.current = null;
      labelGuard?.dispose();
      if (dragLabels.current === labelGuard) dragLabels.current = null;
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
    dragLabels.current?.end();
    gestures.current?.cancel();
    chosenLabels.current?.setActive(false);
    communityBackground.current?.setActive(false);
    hoveredLink.current = undefined;
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
    dragLabels.current?.end();
    gestures.current?.cancel();
    chosenLabels.current?.setActive(false);
    communityBackground.current?.setActive(false);
    hoveredLink.current = undefined;
    // eslint-disable-next-line react/set-state-in-effect -- Controls stay disabled while the external GPU configuration is changing.
    setIsRendering(true);
    setHovered(null);
    session.controls(
      latestProps.current.selectedId,
      latestProps.current.paused,
      latestProps.current.highlightedIds,
      latestProps.current.chosenIds,
      latestProps.current.spotlightIds,
    );
    void session
      .update(prepared, {
        ...interactiveConfig.current,
        ...displayConfig({ settings, colorBy, showLabels, showLinks, pointSize, pointsCount: prepared.pointsCount }),
        ...communities.config,
      })
      .then((stats) => {
        if (!active || !stats) return;
        setCounts({ nodes: stats.pointsCount, links: stats.linksCount });
        setIsRendering(false);
        setError(null);
        chosenLabels.current?.update(
          session.displayed,
          latestProps.current.chosenIds,
          latestProps.current.spotlightIds,
        );
        chosenLabels.current?.setActive(latestProps.current.active !== false);
        communityBackground.current?.update(session.displayed, communities.partition, settings.communityEnabled && settings.communityBackground && settings.dimensions === 2);
        communityBackground.current?.setActive(latestProps.current.active !== false);
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
  }, [session, prepared, showLabels, showLinks, pointSize, colorBy, settings, communities.config, communities.partition]);

  useLayoutEffect(() => {
    if (!visible) {
      dragLabels.current?.end();
      gestures.current?.cancel();
    }
    session?.setActive(visible);
    chosenLabels.current?.setActive(visible && Boolean(session?.isInteractive));
    communityBackground.current?.setActive(visible && Boolean(session?.isInteractive));
  }, [session, visible]);

  useEffect(() => {
    const previous = new Set(previousChosen.current);
    if (
      previous.size !== new Set(chosenIds).size ||
      chosenIds.some((id) => !previous.has(id))
    )
      gestures.current?.cancel();
    previousChosen.current = chosenIds;
    session?.controls(
      selectedId,
      paused,
      highlightedIds,
      chosenIds,
      spotlightIds,
    );
  }, [session, selectedId, paused, highlightedIds, chosenIds, spotlightIds]);
  useEffect(() => {
    chosenLabels.current?.update(
      session?.displayed ?? null,
      chosenIds,
      spotlightIds,
    );
  }, [session, chosenIds, spotlightIds]);
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
      data-community-enabled={settings.communityEnabled}
      data-community-pending={communities.pending}
      data-community-count={communities.partition?.count ?? 0}
      data-community-ms={communities.partition?.calculationMs ?? ""}
      data-community-resolution={settings.communityResolution}
      data-community-strength={settings.communityEnabled ? settings.communityStrength : 0}
      data-active={diagnostics?.active ?? visible}
      data-renderer-id={diagnostics?.sessionId}
      data-configurations={diagnostics?.configurations ?? 0}
      data-data-revisions={diagnostics?.dataRevisions ?? 0}
      data-last-data-update-ms={diagnostics?.lastDataUpdateMs ?? ""}
      data-dimensions={diagnostics?.dimensions ?? 2}
      data-camera={JSON.stringify(diagnostics?.camera ?? null)}
      data-highlighted-count={diagnostics?.highlightedCount ?? 0}
      data-outlined-count={diagnostics?.outlinedCount ?? 0}
      data-requested-highlighted-count={
        diagnostics?.requestedHighlightCount ?? 0
      }
      data-inspected-id={diagnostics?.inspectedId ?? ""}
      data-chosen-count={diagnostics?.chosenIds.length ?? 0}
      data-chosen-ids={JSON.stringify(diagnostics?.chosenIds ?? [])}
      data-pinned-count={diagnostics?.pinnedCount ?? 0}
      data-position-restores={diagnostics?.positionRestorations ?? 0}
      data-restored-points={diagnostics?.restoredPointCount ?? 0}
      data-position-world-error={diagnostics?.positionWorldError ?? ""}
      data-position-screen-error={diagnostics?.positionScreenError ?? ""}
      data-position-samples={JSON.stringify(diagnostics?.positionSamples ?? [])}
      data-layout-before={JSON.stringify(diagnostics?.layoutBefore ?? null)}
      data-layout-after={JSON.stringify(diagnostics?.layoutAfter ?? null)}
      data-layout-snapshot={JSON.stringify(diagnostics?.layoutSnapshot ?? null)}
      data-layout-sample={diagnostics?.layoutSample ?? 0}
      data-layout-sampled-at={diagnostics?.layoutSampledAt ?? ""}
      data-layout-simulation-running={diagnostics?.layoutSimulationRunning ?? ""}
      data-layout-space-info={JSON.stringify(diagnostics?.layoutSpaceInfo ?? null)}
      data-layout-data-revision={diagnostics?.layoutDataRevision ?? ""}
      data-zoom-before={diagnostics?.zoomBefore ?? ""}
      data-zoom-after={diagnostics?.zoomAfter ?? ""}
      data-drag-count={diagnostics?.dragCount ?? 0}
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
      <canvas ref={communityCanvas} className="ag-canvas__community-background" aria-hidden="true" />
      <div
        ref={container}
        className="ag-canvas__renderer"
        style={{
          pointerEvents: loading || visibleError || !visible ? "none" : "auto",
        }}
      />
      {settings.communityEnabled && nodes.length > 0 && !visibleError && (
        <div className="ag-canvas__community-status" role="status">
          {communities.error
            ? <Alert variant="destructive"><AlertDescription>社区计算失败：{communities.error} 可重新启用社区聚合重试。</AlertDescription></Alert>
            : <Badge variant="secondary">{communities.pending ? "正在计算社区…" : communities.partition ? communities.partition.count ? `${communities.partition.count} 个可聚合社区` : "暂无可聚合社区" : "准备社区…"}</Badge>}
        </div>
      )}
      {context && visible && !loading && !visibleError && (
        <div ref={tooltip} className="ag-canvas__tooltip" role="tooltip">
          <strong>{context.title}</strong>
          {context.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
      <GraphCanvasState error={visibleError} loading={loading} initializing={!session} preparing={isPreparing} nodeCount={nodes.length} onRetry={() => setRetry((value) => value + 1)} />
    </div>
  );
}
