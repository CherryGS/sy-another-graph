import {
  failureOf,
  type Failure,
  message as msg,
  MessageError,
} from "../../core/diagnostics/message";
import { text, t } from "../../shared/i18n/runtime";

import { useLocale } from "../../shared/i18n/react";

import { Cosmograph, type CosmographConfig } from "@cosmograph/cosmograph";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createLocalDuckDB, type LocalDuckDB } from "./local-duckdb";

import { prepareGraph, type PreparedGraph } from "./prepare-graph";
import { GraphPreparationClient } from "./preparation-client";

import { GraphTableStore } from "./graph-tables";
import { RendererSession } from "./renderer-session";
import { DragLabelGuard } from "./drag-label-guard";
import { CanvasGestures } from "./canvas-gestures";
import { ChosenLabels } from "./chosen-labels";
import { CommunityBackground } from "./community-background";
import { useCommunities } from "../../modules/communities/use-communities";
import { communityLayoutConfig, renderCommunityPartition } from "./community-layout";
import { Badge } from "@/shared/ui/badge";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { beginCanvasGroupMotion } from "./position-adapter";
import { DEFAULT_GRAPH_SETTINGS } from "../../workbench/presentation/settings";
import { displayConfig } from "./display-config";
import { layerCoordinates } from "../../modules/layout/layers";
import { GraphCanvasState } from "./GraphCanvasState";
import { nodeContext } from "../../workbench/presentation/node-context";
import { canvasClick } from "./canvas-click";
import { hitTestPoint } from "./point-hit-test";
import { labelNodeId, nodeLabelClass } from "./node-label-target";
import { cn } from "@/shared/lib/utils";
import type { CanvasNode, GraphCanvasProps } from "../../workbench/presentation/types";
import "./canvas.css";

export type {
  CanvasNode,
  CanvasEdge,
  CanvasStats,
  GraphCanvasProps,
} from "../../workbench/presentation/types";

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
  error instanceof Error ? failureOf(error) : msg("text.cannotDrawTheGraphPleaseRetry");
const reportCleanupError = (error: unknown) =>
  console.error("Graph resource cleanup failed", error);
const subscribeNothing = () => () => {};
const noDiagnostics = () => null;

export function CosmographCanvas(props: GraphCanvasProps) {
  const language = useLocale();
  const {
    nodes,
    edges,
    selectedId,
    chosenIds,
    highlightedIds,
    spotlightIds,
    evidenceEdges,
    searchOrigins,
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
  const preparation = useRef<GraphPreparationClient | null>(null);
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
  const serializedDiagnostics = useMemo(
    () => ({
      camera: JSON.stringify(diagnostics?.camera ?? null),
      chosenIds: JSON.stringify(diagnostics?.chosenIds ?? []),
      layoutSnapshot: JSON.stringify(diagnostics?.layoutSnapshot ?? null),
      layoutSpaceInfo: JSON.stringify(diagnostics?.layoutSpaceInfo ?? null),
    }),
    [diagnostics],
  );
  const [prepared, setPrepared] = useState<PreparedGraph | null>(null);
  const layered = useMemo(
    () =>
      settings.layoutMode === "layered" && props.layers?.graph === props.analysisGraph
        ? layerCoordinates(nodes, props.layers, settings.dimensions)
        : undefined,
    // An explicit rearrange restores deterministic rows after manual point dragging.
    [
      nodes,
      props.layers,
      props.analysisGraph,
      settings.layoutMode,
      settings.dimensions,
      props.relayoutRequest,
    ],
  );
  const communityAnalysis = useCommunities(
    props.analysisGraph,
    settings.communityEnabled,
    settings.communityResolution,
  );
  const communityPartition = useMemo(() => {
    if (
      !prepared ||
      prepared.indexToNode !== nodes ||
      communityAnalysis.graph !== props.analysisGraph ||
      !communityAnalysis.partition
    )
      return undefined;
    return renderCommunityPartition(props.analysisGraph, communityAnalysis.partition, prepared);
  }, [prepared, nodes, props.analysisGraph, communityAnalysis.graph, communityAnalysis.partition]);
  const communityConfig = useMemo(
    () => communityLayoutConfig(communityPartition),
    [communityPartition],
  );
  const communities = {
    ...communityAnalysis,
    partition: communityPartition,
    config: communityConfig,
  };
  const [counts, setCounts] = useState({ nodes: 0, links: 0 });
  const [isPreparing, setIsPreparing] = useState(true);
  const [isRendering, setIsRendering] = useState(false);
  const [initializationError, setInitializationError] = useState<Failure | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [hovered, setHovered] = useState<CanvasNode | null>(null);
  const context = hovered ? nodeContext(hovered, props.notebookNames, searchOrigins) : null;
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
    const client = new GraphPreparationClient();
    preparation.current = client;
    return () => {
      client.dispose();
      if (preparation.current === client) preparation.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const priorCleanup = previousCleanup;
    let database: LocalDuckDB | undefined;
    let owned: RendererSession | undefined;
    let labels: ChosenLabels | undefined;
    let background: CommunityBackground | undefined;
    let interaction: CanvasGestures | undefined;
    let removeContextMenu: (() => void) | undefined;
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
      latestProps.current.onContextMenu?.(null);
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
      latestProps.current.onContextMenu?.(null);
      interaction?.cancel();
      labels?.setActive(false);
      background?.setActive(false);
      labelGuard?.end();
      owned?.suspend();
      if (active) setInitializationError(t("text.theGraphicsContextWasLostRetryTheGraph"));
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
          else if (action.kind === "inspect") latestProps.current.onSelect(action.id, action.event);
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
              index === undefined ? null : (owned?.displayed?.indexToId[index] ?? null),
              event,
            ),
          // Use the returned stable ID; an old asynchronous label click must not remap its index.
          onLabelClick: (_index, id, event) => choose(id, event),
          onLinkClick: (index) => {
            const edge = owned?.displayed?.indexToEdge[index];
            if (edge && active && owned?.isInteractive) latestProps.current.onInspectEdge(edge);
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
          onDrag: () => {
            labels?.refresh();
            background?.refresh();
          },
          onDragEnd: () => {
            labelGuard?.end();
            labels?.refresh();
            background?.settle();
          },
          onSimulationTick: () => {
            labels?.refresh("simulation");
            background?.refresh("simulation");
          },
          onSimulationPause: refreshStoppedLabels,
          onSimulationEnd: refreshStoppedLabels,
          onZoom: () => {
            labels?.refresh("projection");
            background?.refresh("projection");
          },
          onResize: () => {
            labels?.refresh("projection");
            background?.refresh("projection");
          },
          pointLabelClassName: (_text, _index, id) =>
            cn(
              "ag-graph-label",
              id && nodeLabelClass(id),
              id &&
                (latestProps.current.chosenIds.includes(id) ||
                  latestProps.current.spotlightIds?.includes(id)) &&
                "ag-graph-label--chosen",
            ),
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
          const displayed = owned?.displayed;
          if (!displayed) return null;
          const labelId = labelNodeId(target, displayed.idToIndex);
          if (labelId !== undefined) return labelId;
          const index = hitTestPoint(graph, localPosition(event));
          return index === undefined ? null : (displayed.indexToId[index] ?? null);
        };
        const contextMenu = (event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          const displayed = owned?.displayed;
          if (
            !active ||
            !owned?.isInteractive ||
            displayed?.indexToNode !== latestProps.current.nodes
          ) {
            latestProps.current.onContextMenu?.(null);
            return;
          }
          interaction?.cancel();
          setHovered(null);
          const id = nodeAt(event);
          const index = id === null ? undefined : displayed.idToIndex.get(id);
          const node = index === undefined ? undefined : displayed.indexToNode[index];
          latestProps.current.onContextMenu?.(
            node ? { id: node.id, label: node.label, x: event.clientX, y: event.clientY } : null,
          );
        };
        element.addEventListener("contextmenu", contextMenu, true);
        removeContextMenu = () => element.removeEventListener("contextmenu", contextMenu, true);
        interaction = new CanvasGestures(element, {
          active: () => active && Boolean(owned?.isInteractive),
          chosenIds: () => latestProps.current.chosenIds,
          nodeAt,
          overRelationship: (event) =>
            hoveredLink.current !== undefined ||
            (event.target instanceof Element && Boolean(event.target.closest(".css-label--label"))),
          pointerPosition: localPosition,
          begin: (ids, origin, grabbedId) => {
            const displayed = owned?.displayed;
            if (!displayed) throw new MessageError(msg("text.theGraphIsNotReadyYet"));
            const indices = ids.map((id) => displayed.idToIndex.get(id));
            if (indices.some((index) => index === undefined))
              throw new MessageError(msg("text.theSelectionChangedPleaseStartDraggingAgain"));
            const grabbedIndex = displayed.idToIndex.get(grabbedId);
            if (grabbedIndex === undefined)
              throw new MessageError(msg("text.theDraggedNodesChangedPleaseStartDraggingAgain"));
            return beginCanvasGroupMotion(
              graph,
              indices as number[],
              grabbedIndex,
              origin,
              owned!.positionDimensions,
            );
          },
          onStart: () => {
            labelGuard?.begin();
            setHovered(null);
          },
          onMove: () => {
            labels?.refresh();
            background?.refresh();
          },
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
        if (active && !controller.signal.aborted) setInitializationError(errorMessage(failure));
        if (owned) await owned.dispose().catch(reportCleanupError);
        else await database?.dispose();
      }
    };
    const initializing = initialize();
    return () => {
      active = false;
      removeContextMenu?.();
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
    latestProps.current.onContextMenu?.(null);
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
    void prepareGraph(nodes, edges, controller.signal, preparation.current!.encode, searchOrigins)
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
  }, [nodes, edges, searchOrigins, retry]);

  useEffect(() => {
    if (!session || !prepared) return;
    let active = true;
    latestProps.current.onContextMenu?.(null);
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
      latestProps.current.evidenceEdges,
    );
    void session
      .update(
        prepared,
        {
          ...interactiveConfig.current,
          ...displayConfig({
            settings,
            colorBy,
            showLabels,
            showLinks,
            pointSize,
            pointsCount: prepared.pointsCount,
          }),
          ...communities.config,
        },
        layered,
      )
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
        communityBackground.current?.update(
          session.displayed,
          communities.partition,
          settings.communityEnabled && settings.communityBackground && settings.dimensions === 2,
        );
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
  }, [
    session,
    prepared,
    showLabels,
    showLinks,
    pointSize,
    colorBy,
    settings,
    communities.config,
    communities.partition,
    layered,
  ]);

  useLayoutEffect(() => {
    if (!visible) {
      latestProps.current.onContextMenu?.(null);
      dragLabels.current?.end();
      gestures.current?.cancel();
    }
    session?.setActive(visible);
    chosenLabels.current?.setActive(visible && Boolean(session?.isInteractive));
    communityBackground.current?.setActive(visible && Boolean(session?.isInteractive));
  }, [session, visible]);

  useEffect(() => {
    const previous = new Set(previousChosen.current);
    if (previous.size !== new Set(chosenIds).size || chosenIds.some((id) => !previous.has(id)))
      gestures.current?.cancel();
    previousChosen.current = chosenIds;
    session?.controls(selectedId, paused, highlightedIds, chosenIds, spotlightIds, evidenceEdges);
  }, [session, selectedId, paused, highlightedIds, chosenIds, spotlightIds, evidenceEdges]);
  useEffect(() => {
    chosenLabels.current?.update(session?.displayed ?? null, chosenIds, spotlightIds);
  }, [session, chosenIds, spotlightIds, language]);
  useEffect(() => {
    session?.fit();
  }, [session, fitRequest]);

  const loading = isPreparing || isRendering || !session;
  const rawError = initializationError ?? error;
  const visibleError = rawError ? text(rawError) : null;
  return (
    <div
      className="ag-canvas"
      aria-label={t("text.interactiveKnowledgeGraph")}
      aria-busy={loading && !visibleError}
      data-rendered-nodes={counts.nodes}
      data-rendered-links={counts.links}
      data-layout-mode={settings.layoutMode}
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
      data-camera={serializedDiagnostics.camera}
      data-highlighted-count={diagnostics?.highlightedCount ?? 0}
      data-outlined-count={diagnostics?.outlinedCount ?? 0}
      data-requested-highlighted-count={diagnostics?.requestedHighlightCount ?? 0}
      data-inspected-id={diagnostics?.inspectedId ?? ""}
      data-chosen-count={diagnostics?.chosenIds.length ?? 0}
      data-chosen-ids={serializedDiagnostics.chosenIds}
      data-pinned-count={diagnostics?.pinnedCount ?? 0}
      data-position-restores={diagnostics?.positionRestorations ?? 0}
      data-restored-points={diagnostics?.restoredPointCount ?? 0}
      data-layout-snapshot={serializedDiagnostics.layoutSnapshot}
      data-layout-sample={diagnostics?.layoutSample ?? 0}
      data-layout-sampled-at={diagnostics?.layoutSampledAt ?? ""}
      data-layout-simulation-running={diagnostics?.layoutSimulationRunning ?? ""}
      data-layout-space-info={serializedDiagnostics.layoutSpaceInfo}
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
      <canvas
        ref={communityCanvas}
        className="ag-canvas__community-background"
        aria-hidden="true"
      />
      <div
        ref={container}
        className="ag-canvas__renderer"
        style={{
          pointerEvents: loading || visibleError || !visible ? "none" : "auto",
        }}
      />
      {settings.communityEnabled && nodes.length > 0 && !visibleError && (
        <div className="ag-canvas__community-status" role="status">
          {communities.error ? (
            <Alert variant="destructive">
              <AlertDescription>
                {t("community.failure", { detail: communities.error })}
              </AlertDescription>
            </Alert>
          ) : (
            <Badge variant="secondary">
              {communities.pending
                ? t("text.calculatingCommunities")
                : communities.partition
                  ? communities.partition.count
                    ? t("text.communitiesAvailableValue", { p0: communities.partition.count })
                    : t("text.noCommunitiesToGroup")
                  : t("text.preparingCommunities")}
            </Badge>
          )}
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
      <GraphCanvasState
        error={visibleError}
        loading={loading}
        initializing={!session}
        preparing={isPreparing}
        nodeCount={nodes.length}
        onRetry={() => setRetry((value) => value + 1)}
      />
    </div>
  );
}
