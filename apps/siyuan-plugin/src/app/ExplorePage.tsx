import { useMemo } from "react";
import {
  Focus,
  LoaderCircle,
  Pause,
  Play,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { CosmographCanvas } from "../graph/CosmographCanvas";
import { DEFAULT_FILTERS } from "../data/types";
import { useWorkbench } from "./state";
import { GraphFiltersPanel } from "./GraphFiltersPanel";
import { GraphSearch } from "./GraphSearch";
import { NodeInspector } from "./NodeInspector";
import { EdgeInspector } from "./EdgeInspector";

export function ExplorePage({ active }: { active: boolean }) {
  const state = useWorkbench();
  const { data, filters, selected, view } = state;
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
    data &&
    filters.scopeId &&
    !data.nodes.some((node) => node.id === filters.scopeId);
  const hasInspector = !!selected || !!state.inspectedEdge;
  return (
    <div className={`explore-layout ${hasInspector ? "has-inspector" : ""}`}>
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
            onSelect={state.setSelectedId}
            onClearChosen={state.clearChosen}
            onInspectEdge={state.inspectEdge}
            onOpen={state.openDocument}
            showLabels={state.showLabels}
            showLinks={state.showLinks}
            pointSize={state.pointSize}
            paused={state.paused}
            fitRequest={state.fitRequest}
          />
        )}
        <div className="graph-tools">
          <GraphSearch state={state} />
          <button
            className={`icon-button panel-toggle ${state.filtersOpen ? "selected" : ""}`}
            aria-label="筛选与外观"
            title="筛选与外观"
            aria-expanded={state.filtersOpen}
            onClick={() => state.setFiltersOpen(!state.filtersOpen)}
          >
            <SlidersHorizontal size={15} />
          </button>
        </div>
        {state.filtersOpen && <GraphFiltersPanel state={state} />}
        {(state.chosenIds.length > 0 || filters.scopeId) && (
          <div className="focus-toolbar">
            <span>
              {state.chosenIds.length
                ? `已选 ${state.chosenIds.length}`
                : "选择节点以向外扩展"}
            </span>
            <span>{state.depth} 跳</span>
            {state.busy && <LoaderCircle size={13} className="spin" />}
            {state.chosenIds.length > 0 && (
              <button
                className="secondary-button"
                onClick={state.clearChosen}
                title="也可 Shift 双击空白退出"
              >
                <X size={13} />
                清空选择
              </button>
            )}
            {(state.focusLabel.includes("截断") ||
              state.focusLabel.startsWith("最短路径")) && (
              <span role="status">{state.focusLabel}</span>
            )}
          </div>
        )}
        {state.loading && (
          <div className="stage-message" role="status">
            <LoaderCircle size={25} className="spin" />
            <p>{state.loading}</p>
          </div>
        )}
        {state.error && !state.loading && (
          <div
            className={
              data ? "stage-error-banner" : "stage-message error-state"
            }
            role="alert"
          >
            <p>{state.error}</p>
            <button
              className="secondary-button"
              onClick={() => void state.load()}
            >
              重新读取
            </button>
          </div>
        )}
        {!state.loading && !state.error && data && view.nodes.length === 0 && (
          <div className="stage-message">
            <h3>
              {scopeMissing
                ? "范围块不在当前已读取的内容中"
                : "当前范围没有节点"}
            </h3>
            <button
              className="secondary-button"
              onClick={() =>
                state.setFilters({
                  ...DEFAULT_FILTERS,
                  excludeIds: [],
                  hiddenTypes: [],
                })
              }
            >
              清除筛选
            </button>
          </div>
        )}
        <div className="graph-summary">
          <span>
            {view.nodes.length.toLocaleString()} 节点 ·{" "}
            {view.edges.length.toLocaleString()} 关系
          </span>
          <span className="gesture-help">
            Shift 点击多选 · Shift 拖动所选节点整体移动
          </span>
        </div>
        <div className="canvas-controls">
          <button
            className="icon-button"
            aria-label="适应画布"
            title="适应画布"
            onClick={state.fit}
          >
            <Focus size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={state.paused ? "继续布局" : "暂停布局"}
            title={state.paused ? "继续布局" : "暂停布局"}
            onClick={() => state.setPaused(!state.paused)}
          >
            {state.paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
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
  );
}
