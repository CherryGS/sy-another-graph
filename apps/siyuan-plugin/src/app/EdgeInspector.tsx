import { useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { WorkbenchState } from "./state";
import { EDGE_KIND_LABELS, NODE_TYPE_LABELS } from "../data/labels";
import { nodeType } from "../data/graph-model";
import type { GraphNode } from "../data/types";

function SourceCard({
  node,
  id,
  open,
  canOpen,
}: {
  node: GraphNode | undefined;
  id: string;
  open: (id: string) => void;
  canOpen: boolean;
}) {
  return (
    <button
      className="source-card"
      disabled={!canOpen}
      onClick={() => open(id)}
      title={canOpen ? "打开这一原始位置" : "暂无可打开的原生上下文"}
    >
      <span className="source-card-title">
        {node?.label ?? id}
        {canOpen && <ArrowUpRight size={12} />}
      </span>
      {node && (
        <small>
          {[
            NODE_TYPE_LABELS[nodeType(node)] ?? nodeType(node),
            node.humanPath || node.documentLabel,
            node.heading,
          ]
            .filter(Boolean)
            .join(" · ")}
        </small>
      )}
      {node?.content && (
        <span className="source-card-excerpt">{node.content}</span>
      )}
      <code>{id}</code>
    </button>
  );
}

export function EdgeInspector({ state }: { state: WorkbenchState }) {
  const [limit, setLimit] = useState(15);
  const edge = state.inspectedEdge;
  if (!edge || !state.data) return null;
  const byId = new Map(state.data.nodes.map((node) => [node.id, node]));
  const source = state.currentGraph?.nodes.find(
    (node) => node.index === edge.source,
  );
  const target = state.currentGraph?.nodes.find(
    (node) => node.index === edge.target,
  );
  const occurrences = edge.provenance ?? [];
  return (
    <aside className="inspector-panel edge-inspector" aria-label="关系出处">
      <div className="panel-heading">
        <strong>{EDGE_KIND_LABELS[edge.kind]}</strong>
        <button
          className="icon-button"
          aria-label="关闭关系出处"
          onClick={state.closeEdge}
        >
          <X size={14} />
        </button>
      </div>
      <div className="inspector-content">
        <p className="edge-endpoints">
          {source?.label} → {target?.label}
        </p>
        <p className="input-note">
          {edge.kind === "hierarchy"
            ? "虚线表示内容包含，不是正文引用。"
            : edge.kind === "reference"
              ? "以下是这条连线对应的原始引用端点。"
              : "以下关系来自数据库的真实成员、绑定或关系字段。"}
        </p>
        <p className="field-label">
          {occurrences.length.toLocaleString()} 组出处 ·{" "}
          {edge.weight.toLocaleString()} 条记录
        </p>
        {occurrences.slice(0, limit).map((occurrence, index) => (
          <section
            className="edge-occurrence"
            key={`${occurrence.sourceId}:${occurrence.targetId}:${occurrence.fieldId ?? ""}:${index}`}
          >
            {occurrence.fieldName && <strong>{occurrence.fieldName}</strong>}
            <SourceCard
              node={byId.get(occurrence.sourceId)}
              id={occurrence.sourceId}
              open={state.openDocument}
              canOpen={state.canOpen(occurrence.sourceId)}
            />
            <span className="source-arrow">
              {occurrence.kind === "hierarchy" ? "包含 ↓" : "↓"}
            </span>
            {occurrence.viaIds?.map((id) => (
              <SourceCard
                key={id}
                node={byId.get(id)}
                id={id}
                open={state.openDocument}
                canOpen={state.canOpen(id)}
              />
            ))}
            <SourceCard
              node={byId.get(occurrence.targetId)}
              id={occurrence.targetId}
              open={state.openDocument}
              canOpen={state.canOpen(occurrence.targetId)}
            />
            {occurrence.weight > 1 && (
              <small>{occurrence.weight} 条索引记录</small>
            )}
            {occurrence.databaseId && (
              <details className="document-meta">
                <summary>数据库来源</summary>
                <p>数据库：{occurrence.databaseId}</p>
                {occurrence.targetDatabaseId && (
                  <p>目标数据库：{occurrence.targetDatabaseId}</p>
                )}
                {occurrence.fieldId && <p>字段：{occurrence.fieldId}</p>}
                {occurrence.sourceItemId && (
                  <p>来源条目：{occurrence.sourceItemId}</p>
                )}
                {occurrence.targetItemId && (
                  <p>目标条目：{occurrence.targetItemId}</p>
                )}
              </details>
            )}
          </section>
        ))}
        {occurrences.length > limit && (
          <button
            className="secondary-button full-width"
            onClick={() => setLimit((value) => value + 15)}
          >
            显示更多出处（剩余 {occurrences.length - limit}）
          </button>
        )}
      </div>
    </aside>
  );
}
