import { useMemo, useRef } from "react";
import { ChevronDown, Focus, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverAnchor,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { CosmographCanvas } from "../graph/CosmographCanvas";
import { GraphLegend } from "../graph/GraphLegend";
import { DEFAULT_FILTERS } from "../data/types";
import type { GraphDirection } from "../engine/types";
import { useWorkbench } from "./state";
import { usePanelScrolling } from "./use-panel-scrolling";
import { FilterPresetMenu } from "./FilterPresetMenu";
import { GraphSearch } from "./GraphSearch";
import { GraphActions } from "./GraphActions";
import { GraphNotices } from "./GraphNotices";
import { NodeInspector } from "./NodeInspector";
import { EdgeInspector } from "./EdgeInspector";
import { MentionNotice } from "./MentionNotice";

export function ExplorePage({ active }: { active: boolean }) {
  const state = useWorkbench();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { data, filters, selected, view } = state;
  const panelScrolling = usePanelScrolling();
  const highlightedIds = useMemo(
    () =>
      state.focus
        ? view.nodes
            .filter((node) => state.focus!.has(node.index))
            .map((node) => node.id)
        : undefined,
    [state.focus, view.nodes],
  );
  const notebookNames = useMemo(
    () =>
      Object.fromEntries(
        data?.notebooks.map((book) => [book.id, book.name]) ?? [],
      ),
    [data],
  );
  const scopeMissing =
    !!data &&
    !!filters.scopeId &&
    !state.sourceLookups?.byId.has(filters.scopeId);
  const hasInspector = !!selected || !!state.inspectedEdge;
  return (
    <div className="explore-page">
      <Popover open={state.filtersOpen} onOpenChange={state.setFiltersOpen}>
        <PopoverAnchor virtualRef={toolbarRef} />
        <div
          ref={toolbarRef}
          className="exploration-toolbar"
          aria-label="图谱操作"
        >
          <div className="search-tools">
            <GraphSearch state={state} anchorRef={toolbarRef} />
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant={state.filtersOpen ? "secondary" : "outline"}
                    size="sm"
                    className="max-w-[min(14rem,100%)]"
                    aria-label={`图谱筛选：${state.filterPresets.activeName}${state.filterPresets.modified ? "，已修改" : ""}`}
                  >
                    <span className="truncate">筛选：{state.filterPresets.activeName}</span>
                    {state.filterPresets.modified && <span aria-hidden="true">*</span>}
                    <ChevronDown data-icon="inline-end" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>{state.graphTabState.description}</TooltipContent>
            </Tooltip>
            <GraphLegend
              nodes={view.nodes}
              anchorRef={toolbarRef}
            />
          </div>
          <div className="neighborhood-tools" aria-label="邻域扩展设置">
            <Badge variant="secondary">
              已选 {state.chosenIds.length} 个节点
            </Badge>
            <FieldGroup className="w-32 shrink-0">
              <Field orientation="horizontal" className="w-auto items-center">
                <FieldLabel htmlFor="graph-depth" className="whitespace-nowrap">
                  邻域
                </FieldLabel>
                <Input
                  id="graph-depth"
                  className="w-16 shrink-0"
                  aria-label="邻域深度"
                  type="number"
                  min="0"
                  max="100"
                  value={state.depth}
                  onChange={(event) =>
                    state.setDepth(Number(event.target.value))
                  }
                />
                <span className="text-xs text-muted-foreground">跳</span>
              </Field>
            </FieldGroup>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              aria-label="遍历方向"
              value={state.direction}
              onValueChange={(value) => {
                if (value) state.setDirection(value as GraphDirection);
              }}
            >
              <ToggleGroupItem value="both">双向</ToggleGroupItem>
              <ToggleGroupItem value="out">沿箭头</ToggleGroupItem>
              <ToggleGroupItem value="in">逆箭头</ToggleGroupItem>
            </ToggleGroup>
            {!!state.chosenIds.length && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="清空选择"
                title="清空选择 · Shift 双击空白"
                onClick={state.clearChosen}
              >
                <X />
              </Button>
            )}
            {state.busy && (
              <span
                className="flex items-center gap-1 text-xs text-muted-foreground"
                role="status"
              >
                <Spinner />
                更新邻域
              </span>
            )}
          </div>
          <div className="display-tools">
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              aria-label="图谱维度"
              value={String(state.graphSettings.dimensions)}
              onValueChange={(value) => {
                if (value === "2" || value === "3")
                  state.setGraphSettings({ dimensions: Number(value) as 2 | 3 });
              }}
            >
              <ToggleGroupItem value="2" aria-label="二维模式">
                2D
              </ToggleGroupItem>
              <ToggleGroupItem value="3" aria-label="三维模式">
                3D
              </ToggleGroupItem>
            </ToggleGroup>
            <GraphActions state={state} />
          </div>
        </div>
        <FilterPresetMenu state={state} />
      </Popover>
      <GraphNotices state={state} />
      <MentionNotice state={state} />
      {(state.focusLabel.includes("截断") ||
        state.focusLabel.startsWith("最短路径")) && (
        <Alert className="rounded-none py-2">
          <AlertDescription>{state.focusLabel}</AlertDescription>
        </Alert>
      )}
      <div className={cn("explore-layout", hasInspector && "has-inspector")}>
        <section className="graph-stage" aria-label="图谱画布区域">
          {data && (
            <CosmographCanvas
              nodes={view.nodes}
              edges={view.edges}
              notebookNames={notebookNames}
              selectedId={state.selectedId}
              chosenIds={state.chosenIds}
              highlightedIds={highlightedIds}
              spotlightIds={state.spotlightIds}
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void state.load()}
                >
                  重新读取
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {!state.loading && !state.error && data && !view.nodes.length && (
            <Empty className="stage-message">
              <EmptyHeader>
                <EmptyTitle>
                  {scopeMissing
                    ? "范围块不在当前已读取的内容中"
                    : "当前范围没有节点"}
                </EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  variant="outline"
                  onClick={() =>
                    state.setFilters({
                      ...DEFAULT_FILTERS,
                      excludeIds: [...DEFAULT_FILTERS.excludeIds],
                      hiddenTypes: [...DEFAULT_FILTERS.hiddenTypes],
                    })
                  }
                >
                  清除筛选
                </Button>
              </EmptyContent>
            </Empty>
          )}
          <div className="canvas-controls">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="适应画布"
              title="适应画布"
              onClick={state.fit}
            >
              <Focus />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={state.paused ? "继续布局" : "暂停布局"}
              title={state.paused ? "继续布局" : "暂停布局"}
              onClick={() => state.setPaused(!state.paused)}
            >
              {state.paused ? <Play /> : <Pause />}
            </Button>
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
          {view.nodes.length.toLocaleString()} 节点 ·{" "}
          {view.edges.length.toLocaleString()} 关系
          {filters.mentions !== "off" && ` · ${state.mentionState.result.edges.length.toLocaleString()} 条文本提及`}
        </span>
        <span className="gesture-help">
          {state.graphSettings.dimensions === 3
            ? "空白拖动旋转 · Space 拖动平移 · "
            : ""}
          Shift 点击多选 · Shift 拖动所选节点整体移动
        </span>
      </footer>
    </div>
  );
}
