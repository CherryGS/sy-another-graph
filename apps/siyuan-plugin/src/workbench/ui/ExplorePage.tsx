import { useLocale } from "../../shared/i18n/react";
import { t } from "../../shared/i18n/runtime";
import { presentNodes } from "../presentation/present-nodes";
import { useMemo, useRef } from "react";
import { ChevronDown, Focus, Pause, Play, RotateCcw, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Input } from "@/shared/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Popover, PopoverAnchor, PopoverTrigger } from "@/shared/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/shared/ui/empty";
import { Spinner } from "@/shared/ui/spinner";
import { cn } from "@/shared/lib/utils";
import { useWorkbenchServices } from "../model/services";
import { GraphLegend } from "./GraphLegend";
import type { GraphDirection } from "../../application/sessions/graph-engine";
import { useWorkbench } from "../model/state";
import { usePanelScrolling } from "../model/use-panel-scrolling";
import { FilterPresetMenu } from "./filters/FilterPresetMenu";
import { GraphSearch } from "./GraphSearch";
import { GraphActions } from "./GraphActions";
import { GraphNotices } from "./GraphNotices";
import { ReadDiagnostics } from "./diagnostics/ReadDiagnostics";
import { NodeInspector } from "./inspector/NodeInspector";
import { EdgeInspector } from "./inspector/EdgeInspector";
import { MentionNotice } from "../../modules/mentions/ui/MentionNotice";
import { LayeredLayoutNotice } from "./appearance/LayeredLayoutNotice";

export function ExplorePage({ active }: { active: boolean }) {
  useLocale();
  const state = useWorkbench();
  const { Renderer } = useWorkbenchServices();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { data, filters, selected, view } = state;
  const panelScrolling = usePanelScrolling();
  const canvasNodes = useMemo(
    () => presentNodes(view, data?.notebooks ?? []),
    [view, data?.notebooks],
  );
  const highlightedIds = useMemo(
    () =>
      state.focus
        ? view.nodes.filter((node) => state.focus!.has(node.index)).map((node) => node.id)
        : undefined,
    [state.focus, view.nodes],
  );
  const notebookNames = useMemo(
    () => Object.fromEntries(data?.notebooks.map((book) => [book.id, book.name]) ?? []),
    [data],
  );
  const scopeMissing =
    !!data && !!filters.scopeId && !state.sourceLookups?.byId.has(filters.scopeId);
  const hasInspector = !!selected || !!state.inspectedEdge;
  const discoveryLabels = useMemo(() => {
    const candidate = state.discovery.candidate;
    return candidate !== undefined && state.discovery.index
      ? [...state.spotlightIds, state.discovery.index.documents[candidate].id]
      : state.spotlightIds;
  }, [state.spotlightIds, state.discovery.candidate, state.discovery.index]);
  return (
    <div className="explore-page">
      <Popover open={state.filtersOpen} onOpenChange={state.setFiltersOpen}>
        <PopoverAnchor virtualRef={toolbarRef} />
        <div ref={toolbarRef} className="exploration-toolbar" aria-label={t("text.graphActions")}>
          <div className="search-tools">
            <GraphSearch state={state} anchorRef={toolbarRef} />
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant={state.filtersOpen ? "secondary" : "outline"}
                    className="max-w-[min(14rem,100%)]"
                    aria-label={t("text.graphFilterValueValue", {
                      p0: state.filterPresets.activeName,
                      p1: state.filterPresets.modified ? t("text.modified") : "",
                    })}
                  >
                    <span className="truncate">
                      {t("preset.filterLabel", { name: state.filterPresets.activeName })}
                    </span>
                    {state.filterPresets.modified && <span aria-hidden="true">*</span>}
                    {state.filterPresets.temporaryActive && (
                      <Badge
                        variant={
                          state.filterPresets.missingSearchIds.length && !state.loading
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {state.filterPresets.missingSearchIds.length && !state.loading
                          ? t("text.missingValue", {
                              p0: state.filterPresets.missingSearchIds.length,
                            })
                          : t("text.temporary")}
                      </Badge>
                    )}
                    <ChevronDown data-icon="inline-end" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>{state.graphTabState.description}</TooltipContent>
            </Tooltip>
            <GraphLegend
              nodes={view.nodes}
              searchOrigins={state.searchOrigins}
              anchorRef={toolbarRef}
            />
          </div>
          <div className="neighborhood-tools" aria-label={t("text.neighborhoodSettings")}>
            <div className="flex shrink-0 items-center gap-1">
              <Badge variant="secondary">
                {t("selection.count", { count: state.chosenIds.length })}
              </Badge>
              {!!state.chosenIds.length && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("text.clearSelection")}
                  title={t("text.clearSelectionShiftDoubleClickTheBackground")}
                  onClick={state.clearChosen}
                >
                  <X />
                </Button>
              )}
            </div>
            {/* Inline-size containment would hide the translated label's intrinsic width. */}
            <FieldGroup className="w-max shrink-0 [container-type:normal]">
              <Field orientation="horizontal" className="w-auto items-center">
                <FieldLabel htmlFor="graph-depth" className="whitespace-nowrap">
                  {t("text.neighborhood")}
                </FieldLabel>
                <Input
                  id="graph-depth"
                  className="w-16 shrink-0"
                  aria-label={t("text.neighborhoodDepth")}
                  type="number"
                  min="0"
                  max="100"
                  value={state.depth}
                  onChange={(event) => state.setDepth(Number(event.target.value))}
                />
                <span className="text-xs text-muted-foreground">{t("text.hops")}</span>
              </Field>
            </FieldGroup>
            <ToggleGroup
              type="single"
              variant="outline"
              className="max-w-full flex-wrap"
              aria-label={t("text.traversalDirection")}
              value={state.direction}
              onValueChange={(value) => {
                if (value) state.setDirection(value as GraphDirection);
              }}
            >
              <ToggleGroupItem value="both">{t("text.bothWays")}</ToggleGroupItem>
              <ToggleGroupItem value="out">{t("text.alongArrows")}</ToggleGroupItem>
              <ToggleGroupItem value="in">{t("text.againstArrows")}</ToggleGroupItem>
            </ToggleGroup>
            {state.busy && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
                <Spinner />
                {t("text.updateNeighborhood")}
              </span>
            )}
          </div>
          <div className="display-tools">
            <ToggleGroup
              type="single"
              variant="outline"
              aria-label={t("layout.mode")}
              value={state.graphSettings.layoutMode}
              onValueChange={(layoutMode) => {
                if (layoutMode === "force" || layoutMode === "layered")
                  state.setGraphSettings({ layoutMode });
              }}
            >
              <ToggleGroupItem value="force">{t("layout.force")}</ToggleGroupItem>
              <ToggleGroupItem value="layered">{t("layout.layered")}</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-label={t("text.graphDimension")}
              value={String(state.graphSettings.dimensions)}
              onValueChange={(value) => {
                if (value === "2" || value === "3")
                  state.setGraphSettings({ dimensions: Number(value) as 2 | 3 });
              }}
            >
              <ToggleGroupItem value="2" aria-label={t("text.2dMode")}>
                2D
              </ToggleGroupItem>
              <ToggleGroupItem value="3" aria-label={t("text.3dMode")}>
                3D
              </ToggleGroupItem>
            </ToggleGroup>
            <GraphActions state={state} />
          </div>
        </div>
        <FilterPresetMenu state={state} />
      </Popover>
      <GraphNotices state={state} />
      <MentionNotice mode={filters.mentions} status={state.mentionState} />
      <LayeredLayoutNotice state={state} />
      {state.showFocusNotice && (
        <Alert className="rounded-none py-2">
          <AlertDescription>{state.focusLabel}</AlertDescription>
        </Alert>
      )}
      <div className={cn("explore-layout", hasInspector && "has-inspector")}>
        <section className="graph-stage" aria-label={t("text.graphCanvas")}>
          <ReadDiagnostics state={state} />
          {data && (
            <Renderer
              analysisGraph={state.currentGraph ?? view}
              layers={state.layeredLayout.layers}
              relayoutRequest={state.relayoutRequest}
              nodes={canvasNodes}
              edges={view.edges}
              notebookNames={notebookNames}
              selectedId={state.selectedId}
              chosenIds={state.chosenIds}
              highlightedIds={state.discovery.spotlight?.ids ?? highlightedIds}
              spotlightIds={discoveryLabels}
              evidenceEdges={state.discovery.spotlight?.edges}
              searchOrigins={state.searchOrigins}
              active={active}
              colorBy={state.colorBy}
              settings={state.graphSettings}
              onSelect={state.setSelectedId}
              onClearChosen={state.clearChosen}
              onInspectEdge={state.inspectEdge}
              onOpen={state.openDocument}
              showLabels={state.showLabels}
              showLinks={state.showLinks}
              pointSize={state.pointSize}
              paused={state.paused || panelScrolling}
              fitRequest={state.fitRequest}
            />
          )}
          {state.loading && (
            <div className="stage-message" role="status">
              <Spinner className="size-6" />
              <p>{state.loading}</p>
            </div>
          )}
          {state.error && !state.loading && (
            <Alert variant="destructive" className="stage-error-banner">
              <AlertDescription>
                <p>{state.error}</p>
                <Button variant="outline" size="sm" onClick={() => void state.load()}>
                  {t("text.refreshData")}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {!state.loading && !state.error && data && !view.nodes.length && (
            <Empty className="stage-message">
              <EmptyHeader>
                <EmptyTitle>
                  {scopeMissing
                    ? t("text.theScopeBlockIsNotInTheAcquired")
                    : t("text.noNodesInTheCurrentScope")}
                </EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={state.resetFilters}>
                  {t("text.clearFilters")}
                </Button>
              </EmptyContent>
            </Empty>
          )}
          <div className="canvas-controls" role="group" aria-label={t("text.canvasLayoutControls")}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("text.fitToCanvas")}
              title={t("text.fitToCanvas")}
              onClick={state.fit}
            >
              <Focus />
            </Button>
            {state.graphSettings.layoutMode === "layered" ? (
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!state.layeredLayout.layers}
                aria-label={t("layout.rearrange")}
                title={t("layout.rearrange")}
                onClick={state.relayout}
              >
                <RotateCcw />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={state.paused ? t("text.resumeLayout") : t("text.pauseLayout")}
                title={state.paused ? t("text.resumeLayout") : t("text.pauseLayout")}
                onClick={() => state.setPaused(!state.paused)}
              >
                {state.paused ? <Play /> : <Pause />}
              </Button>
            )}
          </div>
        </section>
        {state.inspectedEdge ? (
          <EdgeInspector
            key={`${state.inspectedEdge.kind}:${state.inspectedEdge.source}:${state.inspectedEdge.target}`}
            state={state}
          />
        ) : (
          selected && <NodeInspector key={selected.id} state={state} />
        )}
      </div>
      <footer className="graph-summary">
        <span>
          {t("graph.counts", { nodes: view.nodes.length, edges: view.edges.length })}
          {filters.mentions !== "off" &&
            t("text.textMentionsValue2", { p0: state.mentionState.result.edges.length })}
        </span>
        <span className="gesture-help">
          {state.graphSettings.dimensions === 3
            ? t("text.dragTheBackgroundToRotateSpaceDragTo") + " "
            : ""}
          {t("text.shiftClickToSelectMultipleNodesShiftDrag")}
        </span>
      </footer>
    </div>
  );
}
