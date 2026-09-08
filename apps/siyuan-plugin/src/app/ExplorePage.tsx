import { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  CircleDot,
  Focus,
  GitBranch,
  Layers,
  Link2,
  LoaderCircle,
  Network,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { CosmographCanvas } from "../graph/CosmographCanvas";
import { useWorkbench } from "./state";

export function ExplorePage() {
  const state = useWorkbench();
  const [depth, setDepth] = useState(1);
  const [target, setTarget] = useState("");
  const [renderTiming, setRenderTiming] = useState<{
    preparationMs: number;
    renderingMs: number;
  } | null>(null);
  const { data, filters, setFilters, selected, view } = state;
  return (
    <div className="explore-layout">
      <aside className="filter-panel">
        <div className="panel-heading">
          <span>探索范围</span>
          <SlidersHorizontal size={15} />
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="搜索图谱节点"
            placeholder="搜索文档或 ID…"
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
              <X size={13} />
            </button>
          )}
        </label>
        {filters.query && (
          <div className="search-results">
            <div className="section-caption">匹配文档 · 最多显示 30 项</div>
            {state.results.length ? (
              state.results.map((node) => (
                <button
                  key={node.id}
                  className={`search-result ${state.selectedId === node.id ? "selected" : ""}`}
                  onClick={() => state.setSelectedId(node.id)}
                >
                  <span
                    className="color-dot"
                    style={{ background: node.color }}
                  />
                  <span>{node.label}</span>
                  <ChevronRight size={13} />
                </button>
              ))
            ) : (
              <p className="muted small">当前范围中没有匹配的文档</p>
            )}
          </div>
        )}
        <div className="filter-section">
          <label className="section-caption" htmlFor="notebook-filter">
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
        </div>
        <div className="filter-section">
          <div className="section-caption">关系类型</div>
          <label className="check-row">
            <Link2 size={15} />
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
            <GitBranch size={15} />
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
            <CircleDot size={15} />
            <span>隐藏孤立文档</span>
            <input
              type="checkbox"
              checked={filters.hideIsolated}
              onChange={(event) =>
                setFilters({ ...filters, hideIsolated: event.target.checked })
              }
            />
          </label>
        </div>
        <div className="filter-section">
          <div className="section-caption">图谱外观</div>
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
              onChange={(event) => state.setShowLabels(event.target.checked)}
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
        <div className="notebook-legend">
          <div className="section-caption">色彩图例</div>
          {data?.notebooks.slice(0, 12).map((book) => (
            <div key={book.id}>
              <span className="color-dot" style={{ background: book.color }} />
              <span>{book.name}</span>
            </div>
          ))}
        </div>
        <div className="panel-note">
          <Layers size={16} />
          <span>
            文档级投影
            <br />
            <small>块引用已聚合为文档关系</small>
          </span>
        </div>
      </aside>
      <section className="graph-stage" aria-label="图谱画布区域">
        <div className="graph-heading">
          <div>
            <span className="eyebrow">KNOWLEDGE LANDSCAPE</span>
            <h2>{state.focusLabel || "让知识的连接浮现"}</h2>
          </div>
          {state.focus && (
            <button className="pill-button" onClick={state.clearFocus}>
              <X size={13} />
              返回全图
            </button>
          )}
        </div>
        <div className="graph-badges">
          <span>
            <i className="live-dot" />
            {state.source !== "siyuan"
              ? "合成数据 · 不修改笔记"
              : "思源数据快照"}
          </span>
          <span>{view.nodes.length.toLocaleString()} 节点</span>
          <span>{view.edges.length.toLocaleString()} 连线</span>
        </div>
        {!state.loading && !state.error && data && view.nodes.length > 0 && (
          <CosmographCanvas
            nodes={view.nodes}
            edges={view.edges}
            selectedId={state.selectedId}
            onSelect={state.setSelectedId}
            onOpen={state.openDocument}
            showLabels={state.showLabels}
            showLinks={state.showLinks}
            pointSize={state.pointSize}
            paused={state.paused}
            fitRequest={state.fitRequest}
            onReady={setRenderTiming}
          />
        )}
        {state.loading && (
          <div className="stage-message" role="status">
            <div className="orbit-loader">
              <Network size={35} />
            </div>
            <h3>连接你的知识网络</h3>
            <p>{state.loading}</p>
          </div>
        )}
        {state.error && (
          <div className="stage-message error-state" role="alert">
            <Network size={36} />
            <h3>图谱暂时无法加载</h3>
            <p>{state.error}</p>
            <button
              className="primary-button"
              onClick={() => void state.load(state.source)}
            >
              重新加载
            </button>
          </div>
        )}
        {!state.loading && !state.error && data && view.nodes.length === 0 && (
          <div className="stage-message">
            <BookOpen size={38} />
            <h3>
              {data.nodes.length
                ? "这个范围中还没有文档"
                : "从一篇笔记开始连接"}
            </h3>
            <p>
              {data.nodes.length
                ? "试着更换笔记本或关闭筛选条件。"
                : "新建文档并建立引用后，刷新即可看到图谱。也可以先体验合成图谱。"}
            </p>
            <button
              className="secondary-button"
              onClick={() =>
                data.nodes.length
                  ? setFilters({
                      query: "",
                      notebook: "",
                      references: true,
                      hierarchy: true,
                      hideIsolated: false,
                    })
                  : void state.load("10000")
              }
            >
              {data.nodes.length ? "清除筛选" : "体验 10,000 节点图谱"}
            </button>
          </div>
        )}
        <div className="canvas-controls">
          <button
            className="icon-button"
            aria-label="适应画布"
            title="适应画布"
            onClick={state.fit}
          >
            <Focus size={18} />
          </button>
          <span />
          <button
            className="icon-button"
            aria-label={state.paused ? "继续布局" : "暂停布局"}
            title={state.paused ? "继续布局" : "暂停布局"}
            onClick={() => state.setPaused(!state.paused)}
          >
            {state.paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
        </div>
        <div className="canvas-help">
          拖动平移 · 滚轮缩放 · 点击查看 · 双击打开文档
        </div>
        {renderTiming && (
          <div className="render-timing" title="最近一次可见图谱的数据准备耗时">
            数据准备 {renderTiming.preparationMs.toFixed(0)} ms
          </div>
        )}
      </section>
      <aside className="inspector-panel">
        <div className="panel-heading">
          <span>文档详情</span>
          {selected ? (
            <button
              className="icon-button"
              aria-label="取消选择"
              onClick={() => state.setSelectedId(null)}
            >
              <X size={15} />
            </button>
          ) : (
            <CircleDot size={16} />
          )}
        </div>
        {selected ? (
          <div className="inspector-content">
            <div className="document-emblem" style={{ color: selected.color }}>
              <BookOpen size={25} />
            </div>
            <h3>{selected.label}</h3>
            <p className="notebook-label">
              <span
                className="color-dot"
                style={{ background: selected.color }}
              />
              {data?.notebooks.find((book) => book.id === selected.notebook)
                ?.name ?? selected.notebook}
            </p>
            <div className="node-metrics">
              <div>
                <strong>{selected.degree.toLocaleString()}</strong>
                <span>连接度</span>
              </div>
              <div>
                <strong>
                  {(
                    data?.edges.filter(
                      (edge) =>
                        edge.target === selected.index &&
                        edge.kind === "reference",
                    ).length ?? 0
                  ).toLocaleString()}
                </strong>
                <span>被引用文档</span>
              </div>
            </div>
            <button
              className="primary-button full-width"
              onClick={() => state.openDocument(selected.id)}
            >
              在思源中打开
              <ArrowUpRight size={16} />
            </button>
            <div className="detail-divider" />
            <div className="section-caption">探索邻域</div>
            <p className="muted small">沿引用与层级关系发现附近的文档。</p>
            <div className="inline-control">
              <select
                aria-label="邻域深度"
                value={depth}
                onChange={(event) => setDepth(Number(event.target.value))}
              >
                <option value="1">1 跳邻域</option>
                <option value="2">2 跳邻域</option>
                <option value="3">3 跳邻域</option>
              </select>
              <button
                className="secondary-button"
                disabled={state.busy}
                onClick={() => void state.neighborhood(depth)}
              >
                {state.busy ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <Focus size={15} />
                )}
                聚焦
              </button>
            </div>
            <div className="detail-divider" />
            <div className="section-caption">寻找最短路径</div>
            <input
              className="text-input"
              aria-label="路径目标文档"
              list="atlas-path-targets"
              placeholder="输入目标标题或 ID"
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
              className="secondary-button full-width"
              disabled={state.busy || !target}
              onClick={() => void state.findPath(target)}
            >
              <GitBranch size={15} />
              查找连接路径
            </button>
            <div className="detail-divider" />
            <div className="section-caption">文档标识</div>
            <code className="node-id">{selected.id}</code>
            {selected.path && <div className="path-label">{selected.path}</div>}
          </div>
        ) : (
          <div className="empty-inspector">
            <div className="selection-illustration">
              <CircleDot size={34} />
              <i />
              <i />
            </div>
            <h3>每个节点，都是一个起点</h3>
            <p>
              选择图谱中的文档，
              <br />
              查看连接、探索邻域，
              <br />
              让想法继续延伸。
            </p>
            <div className="tip-card">
              <Search size={16} />
              <span>从左侧搜索一个熟悉的标题，开始这次探索。</span>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
