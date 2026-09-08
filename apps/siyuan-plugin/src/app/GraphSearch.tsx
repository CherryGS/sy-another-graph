import { ChevronRight, Search, X } from "lucide-react";
import type { WorkbenchState } from "./state";
import { nodeColor } from "../graph/node-colors";
import { nodeType } from "../data/graph-model";
import { NODE_TYPE_LABELS } from "../data/labels";

export function GraphSearch({ state }: { state: WorkbenchState }) {
  const { filters, setFilters } = state;
  return (
    <div className="search-group">
      <label className="search-field">
        <Search size={15} />
        <input
          aria-label="搜索图谱节点"
          placeholder="查找节点标题或 ID…"
          value={filters.query}
          onChange={(event) =>
            setFilters((previous) => ({
              ...previous,
              query: event.target.value,
            }))
          }
        />
        {filters.query && (
          <button
            className="icon-button"
            aria-label="清空搜索"
            onClick={() =>
              setFilters((previous) => ({ ...previous, query: "" }))
            }
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
                className={`search-result ${state.chosenIds.includes(node.id) ? "selected" : ""}`}
                onClick={(event) =>
                  state.setSelectedId(node.id, {
                    shiftKey: event.shiftKey,
                    detail: event.detail,
                  })
                }
                onDoubleClick={() => state.openDocument(node.id)}
              >
                <span
                  className="color-dot"
                  style={{ background: nodeColor(node, state.colorBy) }}
                />
                <span className="search-result-context">
                  <span>{node.label}</span>
                  <small>
                    {[
                      NODE_TYPE_LABELS[nodeType(node)] ?? nodeType(node),
                      node.humanPath || node.documentLabel,
                      node.heading,
                      state.data?.notebooks.find(
                        (book) => book.id === node.notebook,
                      )?.name,
                    ]
                      .filter(Boolean)
                      .join(" · ") ||
                      node.path ||
                      node.id}
                  </small>
                </span>
                <ChevronRight size={13} />
              </button>
            ))
          ) : (
            <p className="muted small">当前范围没有匹配节点</p>
          )}
        </div>
      )}
    </div>
  );
}
