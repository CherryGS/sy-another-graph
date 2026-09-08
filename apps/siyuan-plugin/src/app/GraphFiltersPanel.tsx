import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { WorkbenchState } from "./state";
import { DEFAULT_FILTERS } from "../data/types";
import { nodeType } from "../data/graph-model";
import { NODE_TYPE_LABELS } from "../data/labels";
import type { GraphColorMode } from "../graph/node-colors";
import type { GraphDirection } from "../engine/types";

const NATIVE_ID = /^\d{14}-[a-z0-9]{7}$/;

export function GraphFiltersPanel({ state }: { state: WorkbenchState }) {
  const { filters, setFilters, data } = state;
  const [scopeDraft, setScopeDraft] = useState(filters.scopeId);
  const [excludeDraft, setExcludeDraft] = useState(
    filters.excludeIds.join("\n"),
  );
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Host and saved-view actions replace the editable scope value.
    setScopeDraft(filters.scopeId);
  }, [filters.scopeId]);
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Saved-view actions replace the exclusion list.
    setExcludeDraft(filters.excludeIds.join("\n"));
  }, [filters.excludeIds]);
  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of data?.nodes ?? [])
      counts.set(nodeType(node), (counts.get(nodeType(node)) ?? 0) + 1);
    return [...counts].sort(([a], [b]) =>
      a === "d" ? -1 : b === "d" ? 1 : a.localeCompare(b),
    );
  }, [data]);
  const excludeIds = excludeDraft.split(/[\s,，;；]+/).filter(Boolean);
  const scopeValid = scopeDraft === "" || NATIVE_ID.test(scopeDraft);
  const exclusionsValid = excludeIds.every((id) => NATIVE_ID.test(id));
  return (
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
      <div
        className="neighborhood-settings"
        role="group"
        aria-label="邻域扩展设置"
      >
        <div>
          <label className="field-label" htmlFor="graph-depth">
            邻域深度 · 跳
          </label>
          <input
            id="graph-depth"
            className="text-input"
            aria-label="邻域深度"
            type="number"
            min="0"
            max="100"
            value={state.depth}
            onChange={(event) => state.setDepth(Number(event.target.value))}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="graph-direction">
            遍历方向
          </label>
          <select
            id="graph-direction"
            aria-label="遍历方向"
            value={state.direction}
            onChange={(event) =>
              state.setDirection(event.target.value as GraphDirection)
            }
          >
            <option value="both">双向</option>
            <option value="out">沿箭头 →</option>
            <option value="in">逆箭头 ←</option>
          </select>
        </div>
      </div>
      <p className="input-note">
        从所选节点向外扩展；修改后自动生效，初始范围保留。
      </p>
      <label className="field-label" htmlFor="graph-scope">
        初始范围 · 文档或块 ID
      </label>
      <input
        id="graph-scope"
        className="text-input"
        placeholder="留空查看全部内容"
        value={scopeDraft}
        aria-invalid={!scopeValid}
        onChange={(event) => {
          const value = event.target.value.trim();
          setScopeDraft(value);
          if (!value || NATIVE_ID.test(value))
            setFilters((previous) => ({ ...previous, scopeId: value }));
        }}
      />
      {!scopeValid && (
        <p className="input-note error-text">
          请输入完整块 ID；当前范围仍保持原值。
        </p>
      )}
      <label className="check-row">
        <span>包含子文档</span>
        <input
          type="checkbox"
          checked={filters.includeChildDocuments}
          onChange={(event) =>
            setFilters((previous) => ({
              ...previous,
              includeChildDocuments: event.target.checked,
            }))
          }
        />
      </label>
      <label className="field-label" htmlFor="graph-exclusions">
        排除这些 ID 下的内容
      </label>
      <textarea
        id="graph-exclusions"
        className="text-input"
        rows={2}
        placeholder="每行一个文档或块 ID"
        value={excludeDraft}
        aria-invalid={!exclusionsValid}
        onChange={(event) => {
          const value = event.target.value;
          setExcludeDraft(value);
          const ids = value.split(/[\s,，;；]+/).filter(Boolean);
          if (ids.every((id) => NATIVE_ID.test(id)))
            setFilters((previous) => ({
              ...previous,
              excludeIds: [...new Set(ids)],
            }));
        }}
      />
      {!exclusionsValid && (
        <p className="input-note error-text">
          包含不完整的 ID；原排除条件仍生效。
        </p>
      )}
      <label className="field-label" htmlFor="notebook-filter">
        笔记本
      </label>
      <select
        id="notebook-filter"
        value={filters.notebook}
        onChange={(event) =>
          setFilters((previous) => ({
            ...previous,
            notebook: event.target.value,
          }))
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
          <span>块引用 · 实线</span>
          <input
            type="checkbox"
            checked={filters.references}
            onChange={(event) =>
              setFilters((previous) => ({
                ...previous,
                references: event.target.checked,
              }))
            }
          />
        </label>
        <label className="check-row">
          <span>包含关系 · 虚线</span>
          <input
            type="checkbox"
            checked={filters.hierarchy}
            onChange={(event) =>
              setFilters((previous) => ({
                ...previous,
                hierarchy: event.target.checked,
              }))
            }
          />
        </label>
        <label className="check-row">
          <span>数据库关系</span>
          <input
            type="checkbox"
            checked={filters.databases}
            onChange={(event) =>
              setFilters((previous) => ({
                ...previous,
                databases: event.target.checked,
              }))
            }
          />
        </label>
        <p className="input-note">
          关闭的关系不参与跳数扩展。每条启用的关系计 1 跳。
        </p>
        <label className="check-row">
          <span>隐藏未选中的孤立节点</span>
          <input
            type="checkbox"
            checked={filters.hideIsolated}
            onChange={(event) =>
              setFilters((previous) => ({
                ...previous,
                hideIsolated: event.target.checked,
              }))
            }
          />
        </label>
      </div>
      <details className="filter-section type-controls" open>
        <summary>节点类型 · 作用于整幅图</summary>
        <div className="type-presets">
          <button
            className="secondary-button"
            onClick={() =>
              setFilters((previous) => ({ ...previous, hiddenTypes: [] }))
            }
          >
            全部类型
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              setFilters((previous) => ({
                ...previous,
                hiddenTypes: types
                  .map(([type]) => type)
                  .filter((type) => type !== "d"),
              }))
            }
          >
            仅文档
          </button>
        </div>
        {types.map(([type, count]) => (
          <label className="check-row" key={type}>
            <span>
              {NODE_TYPE_LABELS[type] ?? type}
              <small>{count.toLocaleString()}</small>
            </span>
            <input
              type="checkbox"
              aria-label={`显示${NODE_TYPE_LABELS[type] ?? type}`}
              disabled={type === "d"}
              checked={type === "d" || !filters.hiddenTypes.includes(type)}
              onChange={(event) =>
                setFilters((previous) => ({
                  ...previous,
                  hiddenTypes: event.target.checked
                    ? previous.hiddenTypes.filter((hidden) => hidden !== type)
                    : [...previous.hiddenTypes, type],
                }))
              }
            />
          </label>
        ))}
        <p className="input-note">
          隐藏块的引用归入所属文档；隐藏已选块会取消它的选择和固定。
        </p>
      </details>
      <details className="filter-section">
        <summary>外观</summary>
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
          <span>显示标签</span>
          <input
            type="checkbox"
            checked={state.showLabels}
            onChange={(event) => state.setShowLabels(event.target.checked)}
          />
        </label>
        <label className="check-row">
          <span>显示连线</span>
          <input
            type="checkbox"
            checked={state.showLinks}
            onChange={(event) => state.setShowLinks(event.target.checked)}
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
            value={state.pointSize}
            onChange={(event) => state.setPointSize(Number(event.target.value))}
          />
        </label>
      </details>
      <button
        className="secondary-button full-width"
        onClick={() =>
          setFilters({ ...DEFAULT_FILTERS, excludeIds: [], hiddenTypes: [] })
        }
      >
        重置筛选
      </button>
    </aside>
  );
}
