import { useState } from "react";
import { GitBranch, X } from "lucide-react";
import type { WorkbenchState } from "./state";
import { nodeColor } from "../graph/node-colors";
import { nodeType } from "../data/graph-model";
import { EDGE_KIND_LABELS, NODE_TYPE_LABELS } from "../data/labels";

export function NodeInspector({ state }: { state: WorkbenchState }) {
  const [target, setTarget] = useState("");
  const [limit, setLimit] = useState(30);
  const node = state.selected;
  if (!node) return null;
  const incident = state.view.edges.filter(
    (edge) => edge.source === node.index || edge.target === node.index,
  );
  const byIndex = new Map(
    state.currentGraph?.nodes.map((candidate) => [candidate.index, candidate]),
  );
  return (
    <aside className="inspector-panel" aria-label="节点详情">
      <div className="panel-heading">
        <span
          className="color-dot"
          style={{ background: nodeColor(node, state.colorBy) }}
        />
        <strong title={node.label}>{node.label}</strong>
        <button
          className="icon-button"
          aria-label="关闭节点详情"
          onClick={state.closeInspector}
        >
          <X size={14} />
        </button>
      </div>
      <div className="inspector-content">
        <p className="notebook-label">
          {NODE_TYPE_LABELS[nodeType(node)] ?? nodeType(node)}
          {node.notebook &&
            ` · ${state.data?.notebooks.find((book) => book.id === node.notebook)?.name ?? node.notebook}`}
        </p>
        {(node.humanPath || node.documentLabel) && (
          <p className="source-location">
            {node.humanPath || node.documentLabel}
            {node.heading && ` › ${node.heading}`}
          </p>
        )}
        {node.content && <p className="node-excerpt">{node.content}</p>}
        <p className="input-note">双击画布节点或标签可打开原文。</p>
        <div className="detail-divider" />
        <p className="field-label">
          当前显示的关系 · {incident.length.toLocaleString()}
        </p>
        <div className="relationship-list">
          {incident.slice(0, limit).map((edge, index) => {
            const outward = edge.source === node.index;
            const other = byIndex.get(outward ? edge.target : edge.source);
            return (
              <button
                key={`${edge.kind}:${edge.source}:${edge.target}:${index}`}
                onClick={() => state.inspectEdge(edge)}
              >
                <small>
                  {EDGE_KIND_LABELS[edge.kind]} · {outward ? "→" : "←"}
                </small>
                <span>{other?.label ?? "未知端点"}</span>
                {edge.weight > 1 && <small>{edge.weight} 条记录</small>}
              </button>
            );
          })}
        </div>
        {incident.length > limit && (
          <button
            className="secondary-button full-width"
            onClick={() => setLimit((value) => value + 30)}
          >
            显示更多关系（剩余 {incident.length - limit}）
          </button>
        )}
        <details className="document-meta">
          <summary>节点信息</summary>
          <code>{node.id}</code>
          {node.path && <p>{node.path}</p>}
          {node.databaseId && <p>数据库：{node.databaseId}</p>}
          {node.itemId && <p>条目：{node.itemId}</p>}
        </details>
        <details className="document-meta">
          <summary>已有路径工具</summary>
          <label className="field-label" htmlFor="path-target">
            目标标题或 ID
          </label>
          <input
            id="path-target"
            className="text-input"
            aria-label="路径目标节点"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          />
          <button
            className="secondary-button full-width path-button"
            disabled={state.busy || !target}
            onClick={() => void state.findPath(target)}
          >
            <GitBranch size={14} />
            查找路径
          </button>
        </details>
      </div>
    </aside>
  );
}
