import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Focus,
  GitBranch,
  LoaderCircle,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { CosmographCanvas } from "../graph/CosmographCanvas";
import { nodeColor, type GraphColorMode } from "../graph/node-colors";
import { useWorkbench } from "./state";
import type { GraphDirection } from "../engine/types";

export function ExplorePage({ active }: { active: boolean }) {
  const state = useWorkbench();
  const [depth, setDepth] = useState(1);
  const [target, setTarget] = useState("");
  const { data, filters, setFilters, selected, view } = state;
  const highlightedIds = useMemo(
    () =>
      state.focus
        ? view.nodes
            .filter((node) => state.focus!.has(node.index))
            .map((node) => node.id)
        : undefined,
    [state.focus, view.nodes],
  );
  const incoming = useMemo(
    () =>
      selected
        ? (data?.edges.filter(
            (edge) =>
              edge.target === selected.index && edge.kind === "reference",
          ).length ?? 0)
        : 0,
    [data, selected],
  );
  const resetFilters = () =>
    setFilters({
      query: "",
      notebook: "",
      references: true,
      hierarchy: true,
      hideIsolated: false,
    });
  return (
    <div className={`explore-layout ${selected ? "has-inspector" : ""}`}>
      <section className="graph-stage" aria-label="图谱画布区域">
        {data && (
          <CosmographCanvas
            nodes={view.nodes}
            edges={view.edges}
            selectedId={state.selectedId}
            highlightedIds={highlightedIds}
            active={active}
            colorBy={state.colorBy}
            onSelect={state.setSelectedId}
            onOpen={state.openDocument}
            showLabels={state.showLabels}
            showLinks={state.showLinks}
            pointSize={state.pointSize}
            paused={state.paused}
            fitRequest={state.fitRequest}
          />
        )}
        <div className="graph-tools">
          <div className="search-group">
            <label className="search-field">
              <Search size={15} />
              <input
                aria-label="搜索图谱节点"
                placeholder="搜索文档…"
                value={filters.query}
                onChange={(event) =>
                  setFilters({ ...filters, query: event.target.value })
                }
              />
              {filters.query && (
                <button
                  className="icon-button"
                  aria-label="清空搜索"
                  onClick={() => setFilters({ ...filters, query: "" })}
                >
                  <X size={12} />
                </button>
              )}
            </label>
            {filters.query && (
              <div className="search-results">
                {state.results.length ? (
                  state.results.map((node) => (
                    <button
                      key={node.id}
                      className={`search-result ${state.selectedId === node.id ? "selected" : ""}`}
                      onClick={() => state.setSelectedId(node.id)}
                    >
                      <span
                        className="color-dot"
                        style={{ background: nodeColor(node, state.colorBy) }}
                      />
                      <span>{node.label}</span>
                      <ChevronRight size={13} />
                    </button>
                  ))
                ) : (
                  <p className="muted small">当前范围没有匹配文档</p>
                )}
              </div>
            )}
          </div>
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
        {state.filtersOpen && (
          <aside className="filter-panel" aria-label="筛选与外观设置">
            <div className="panel-heading">
              <strong>筛选与外观</strong>
              <button
                className="icon-button"
                aria-label="关闭筛选"
                onClick={() => state.setFiltersOpen(false)}
              >
                <X size={13} />
              </button>
            </div>
            <label className="field-label" htmlFor="notebook-filter">
              笔记本
            </label>
            <select
              id="notebook-filter"
              value={filters.notebook}
              onChange={(event) =>
                setFilters({ ...filters, notebook: event.target.value })
              }
            >
              <option value="">全部笔记本</option>
              {data?.notebooks.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.name}
                </option>
              ))}
            </select>
            <div className="filter-section">
              <label className="check-row">
                <span>文档引用</span>
                <input
                  type="checkbox"
                  checked={filters.references}
                  onChange={(event) =>
                    setFilters({ ...filters, references: event.target.checked })
                  }
                />
              </label>
              <label className="check-row">
                <span>文档层级</span>
                <input
                  type="checkbox"
                  checked={filters.hierarchy}
                  onChange={(event) =>
                    setFilters({ ...filters, hierarchy: event.target.checked })
                  }
                />
              </label>
              <label className="check-row">
                <span>隐藏孤立文档</span>
                <input
                  type="checkbox"
                  checked={filters.hideIsolated}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      hideIsolated: event.target.checked,
                    })
                  }
                />
              </label>
            </div>
            <div className="filter-section">
              <label className="field-label" htmlFor="node-colors">
                节点颜色
              </label>
              <select
                id="node-colors"
                value={state.colorBy}
                onChange={(event) =>
                  state.setColorBy(event.target.value as GraphColorMode)
                }
              >
                <option value="branch">按文档分支</option>
                <option value="notebook">按笔记本</option>
                <option value="degree">按连接度</option>
              </select>
              <label className="check-row">
                <span>显示连线</span>
                <input
                  type="checkbox"
                  checked={state.showLinks}
                  onChange={(event) => state.setShowLinks(event.target.checked)}
                />
              </label>
              <label className="check-row">
                <span>显示标签</span>
                <input
                  type="checkbox"
                  checked={state.showLabels}
                  onChange={(event) =>
                    state.setShowLabels(event.target.checked)
                  }
                />
              </label>
              <label className="range-row">
                <span>节点大小</span>
                <output>{state.pointSize}</output>
                <input
                  aria-label="节点大小"
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={state.pointSize}
                  onChange={(event) =>
                    state.setPointSize(Number(event.target.value))
                  }
                />
              </label>
            </div>
            <p className="direction-key">
              <span>引用：引用者 → 被引用文档</span>
              <span>层级：父文档 → 子文档</span>
            </p>
            <button
              className="secondary-button full-width"
              onClick={resetFilters}
            >
              重置筛选
            </button>
          </aside>
        )}
        {state.focus && (
          <div className="focus-toolbar">
            <span>{state.focusLabel}</span>
            <label className="isolate-focus">
              <input
                type="checkbox"
                checked={state.isolateFocus}
                onChange={(event) =>
                  state.setIsolateFocus(event.target.checked)
                }
              />
              仅显示结果
            </label>
            <button className="secondary-button" onClick={state.clearFocus}>
              <X size={13} />
              清除高亮
            </button>
          </div>
        )}
        {state.loading && (
          <div className="stage-message" role="status">
            <LoaderCircle size={25} className="spin" />
            <p>{state.loading}</p>
          </div>
        )}
        {state.error && (
          <div className="stage-message error-state" role="alert">
            <h3>无法读取图谱</h3>
            <p>{state.error}</p>
            <button
              className="primary-button"
              onClick={() => void state.load()}
            >
              重新加载
            </button>
          </div>
        )}
        {!state.loading && !state.error && data && view.nodes.length === 0 && (
          <div className="stage-message">
            <BookOpen size={28} />
            <h3>
              {data.nodes.length ? "当前筛选没有文档" : "工作空间暂无文档"}
            </h3>
            <button
              className="secondary-button"
              onClick={
                data.nodes.length ? resetFilters : () => void state.load()
              }
            >
              {data.nodes.length ? "清除筛选" : "重新读取工作空间"}
            </button>
          </div>
        )}
        <div className="graph-summary">
          <span>
            {view.nodes.length.toLocaleString()} 节点 ·{" "}
            {view.edges.length.toLocaleString()} 关系
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
      {selected && (
        <aside className="inspector-panel" aria-label="文档详情">
          <div className="panel-heading">
            <span
              className="color-dot"
              style={{ background: nodeColor(selected, state.colorBy) }}
            />
            <strong title={selected.label}>{selected.label}</strong>
            <button
              className="icon-button"
              aria-label="取消选择"
              onClick={() => state.setSelectedId(null)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="inspector-content">
            <p className="notebook-label">
              {data?.notebooks.find((book) => book.id === selected.notebook)
                ?.name ?? selected.notebook}
            </p>
            <div className="node-metrics">
              <span>
                <strong>{selected.degree.toLocaleString()}</strong> 连接
              </span>
              <span>
                <strong>{incoming.toLocaleString()}</strong> 被引用文档
              </span>
            </div>
            <button
              className="primary-button full-width"
              onClick={() => state.openDocument(selected.id)}
            >
              打开文档
              <ArrowUpRight size={15} />
            </button>
            <div className="detail-divider" />
            <label className="field-label" htmlFor="graph-direction">
              邻域 / 路径方向
            </label>
            <select
              id="graph-direction"
              aria-label="遍历方向"
              className="full-width"
              value={state.direction}
              onChange={(event) =>
                state.setDirection(event.target.value as GraphDirection)
              }
            >
              <option value="both">双向</option>
              <option value="out">沿箭头 →</option>
              <option value="in">逆箭头 ←</option>
            </select>
            <label className="field-label" htmlFor="neighborhood-depth">
              邻域
            </label>
            <div className="inline-control">
              <select
                id="neighborhood-depth"
                aria-label="邻域深度"
                value={depth}
                onChange={(event) => setDepth(Number(event.target.value))}
              >
                <option value="1">1 跳</option>
                <option value="2">2 跳</option>
                <option value="3">3 跳</option>
              </select>
              <button
                className="secondary-button"
                disabled={state.busy}
                onClick={() => void state.neighborhood(depth)}
              >
                {state.busy ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <Focus size={14} />
                )}
                  高亮邻域
              </button>
            </div>
            <div className="detail-divider" />
            <label className="field-label" htmlFor="path-target">
              最短路径
            </label>
            <input
              id="path-target"
              className="text-input"
              aria-label="路径目标文档"
              list="atlas-path-targets"
              placeholder="目标标题或 ID"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
            <datalist id="atlas-path-targets">
              {data?.nodes
                .filter(
                  (node) =>
                    target &&
                    node.label
                      .toLocaleLowerCase()
                      .includes(target.toLocaleLowerCase()),
                )
                .slice(0, 30)
                .map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.label}
                  </option>
                ))}
            </datalist>
            <button
              className="secondary-button full-width path-button"
              disabled={state.busy || !target}
              onClick={() => void state.findPath(target)}
            >
              <GitBranch size={14} />
              查找路径
            </button>
            <details className="document-meta">
              <summary>文档信息</summary>
              <code>{selected.id}</code>
              <p>{selected.path}</p>
            </details>
          </div>
        </aside>
      )}
    </div>
  );
}
