import {
  Activity,
  ArrowUpRight,
  Boxes,
  CircleDot,
  GitBranch,
  Link2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useWorkbench } from "./state";

export function InsightsPage() {
  const state = useWorkbench();
  const navigate = useNavigate();
  const { data, stats, currentGraph } = state;
  if (!data || !stats || !currentGraph)
    return (
      <div className="page-empty">
        <Activity size={35} />
        <h2>图谱加载完成后，这里会呈现它的结构</h2>
        <p>{state.error || state.loading}</p>
      </div>
    );
  const isolated = currentGraph.nodes.filter(
    (node) => node.degree === 0,
  ).length;
  const connected = currentGraph.nodes.length - isolated;
  const topNodes = currentGraph.nodes
    .slice()
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 8);
  const references = currentGraph.edges.filter(
    (edge) => edge.kind === "reference",
  ).length;
  const metrics = [
    {
      label: "可探索节点",
      value: currentGraph.nodes.length.toLocaleString(),
      detail: `${data.notebooks.length} 个笔记本`,
      Icon: CircleDot,
    },
    {
      label: "引用关系",
      value: references.toLocaleString(),
      detail: `${currentGraph.edges
        .filter((edge) => edge.kind === "reference")
        .reduce((total, edge) => total + edge.weight, 0)
        .toLocaleString()} 条源引用记录`,
      Icon: Link2,
    },
    {
      label: "连通分量",
      value: stats.components.toLocaleString(),
      detail: `最大分量 ${stats.largestComponent.toLocaleString()} 个节点`,
      Icon: Boxes,
    },
    {
      label: "平均连接度",
      value: (currentGraph.nodes.length
        ? stats.degrees.reduce((a, b) => a + b, 0) / currentGraph.nodes.length
        : 0
      ).toFixed(2),
      detail: `${isolated.toLocaleString()} 个孤立节点`,
      Icon: GitBranch,
    },
  ];
  return (
    <div className="scroll-page">
      <div className="page-title">
        <div>
          <h2>洞察</h2>
        </div>
        <span className="source-chip">思源工作空间</span>
      </div>
      <div className="metric-grid">
        {metrics.map(({ label, value, detail, Icon }) => (
          <div className="metric-card" key={label}>
            <span>
              <Icon size={17} />
              {label}
            </span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      <div className="insights-grid">
        <section className="content-card">
          <div className="card-heading">
            <h3>连接枢纽</h3>
            <span>按连接度排序</span>
          </div>
          {topNodes.map((node, index) => (
            <button
              className="rank-row"
              key={node.id}
              onClick={() => {
                state.setSelectedId(node.id);
                void navigate({ to: "/" });
              }}
            >
              <span className="rank-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="color-dot" style={{ background: node.color }} />
              <span className="rank-name">{node.label}</span>
              <span className="rank-bar">
                <i
                  style={{
                    width: `${Math.max(3, (node.degree / (topNodes[0]?.degree || 1)) * 100)}%`,
                    background: node.color,
                  }}
                />
              </span>
              <strong>{node.degree}</strong>
              <ArrowUpRight size={14} />
            </button>
          ))}
        </section>
        <section className="content-card">
          <div className="card-heading">
            <h3>知识覆盖</h3>
            <span>节点连接情况</span>
          </div>
          <div className="coverage-visual">
            <div
              className="coverage-ring"
              style={{
                background: `conic-gradient(#a595ff ${currentGraph.nodes.length ? (connected / currentGraph.nodes.length) * 360 : 0}deg, #2b2d3d 0deg)`,
              }}
            >
              <div>
                <strong>
                  {currentGraph.nodes.length
                    ? Math.round((connected / currentGraph.nodes.length) * 100)
                    : 0}
                  <small>%</small>
                </strong>
                <span>节点已有连接</span>
              </div>
            </div>
            <div className="coverage-legend">
              <p>
                <i style={{ background: "#a595ff" }} />
                已连接<strong>{connected.toLocaleString()}</strong>
              </p>
              <p>
                <i style={{ background: "#45485e" }} />
                孤立节点<strong>{isolated.toLocaleString()}</strong>
              </p>
            </div>
          </div>
        </section>
      </div>
      <details className="content-card runtime-card">
        <summary>
          <Zap size={17} />
          运行信息
        </summary>
        <div className="runtime-grid">
          <div>
            <span>图计算核心</span>
            <strong>{stats.backend}</strong>
          </div>
          <div>
            <span>数据传输</span>
            <strong>
              {stats.transport === "shared"
                ? "共享缓冲区"
                : "Transferable 缓冲区"}
            </strong>
          </div>
          <div>
            <span>数据读取</span>
            <strong>{data.loadMs.toFixed(1)} ms</strong>
          </div>
          <div>
            <span>图索引构建</span>
            <strong>{stats.buildMs.toFixed(1)} ms</strong>
          </div>
        </div>
        <p className="runtime-note">
          <ShieldCheck size={15} />
          {stats.transport === "shared"
            ? "当前环境支持共享缓冲区传输；图算法仍运行在专用 Worker 中。"
            : "当前思源页面未启用跨源隔离，使用可转移缓冲区。图计算在专用 Worker 中进行。"}
        </p>
        <p className="muted small">
          统计覆盖当前类型与关系设置下可参与扩展的内容，范围背景和跳数结果不会成为新的统计边界。
          {data.skippedReferences > 0 &&
            ` 已略过 ${data.skippedReferences.toLocaleString()} 条端点不可用的源引用记录。`}
        </p>
      </details>
    </div>
  );
}
