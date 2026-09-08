import {
  Activity,
  ArrowUpRight,
  Boxes,
  CircleDot,
  GitBranch,
  Link2,
  Network,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useWorkbench } from "./state";

export function InsightsPage() {
  const state = useWorkbench();
  const navigate = useNavigate();
  const { data, stats } = state;
  if (!data || !stats)
    return (
      <div className="page-empty">
        <Activity size={35} />
        <h2>图谱加载完成后，这里会呈现它的结构</h2>
        <p>{state.error || state.loading}</p>
      </div>
    );
  const isolated = data.nodes.filter((node) => node.degree === 0).length;
  const connected = data.nodes.length - isolated;
  const topNodes = data.nodes
    .slice()
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 8);
  const references = data.edges.filter(
    (edge) => edge.kind === "reference",
  ).length;
  const metrics = [
    {
      label: "文档节点",
      value: data.nodes.length.toLocaleString(),
      detail: `${data.notebooks.length} 个笔记本`,
      Icon: CircleDot,
    },
    {
      label: "文档间引用",
      value: references.toLocaleString(),
      detail: `${data.referenceCount.toLocaleString()} 次原始块引用`,
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
      value: (data.nodes.length
        ? stats.degrees.reduce((a, b) => a + b, 0) / data.nodes.length
        : 0
      ).toFixed(2),
      detail: `${isolated.toLocaleString()} 篇孤立文档`,
      Icon: GitBranch,
    },
  ];
  return (
    <div className="scroll-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">GRAPH INSIGHTS</span>
          <h2>看见知识网络的结构</h2>
          <p>连接密度、关键文档和运行状态，一目了然。</p>
        </div>
        <span className="source-chip">
          {data.source === "demo" ? "合成测试数据" : "思源工作空间"}
        </span>
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
            <span>文档连接情况</span>
          </div>
          <div className="coverage-visual">
            <div
              className="coverage-ring"
              style={{
                background: `conic-gradient(#a595ff ${data.nodes.length ? (connected / data.nodes.length) * 360 : 0}deg, #2b2d3d 0deg)`,
              }}
            >
              <div>
                <strong>
                  {data.nodes.length
                    ? Math.round((connected / data.nodes.length) * 100)
                    : 0}
                  <small>%</small>
                </strong>
                <span>文档已有连接</span>
              </div>
            </div>
            <div className="coverage-legend">
              <p>
                <i style={{ background: "#a595ff" }} />
                已连接<strong>{connected.toLocaleString()}</strong>
              </p>
              <p>
                <i style={{ background: "#45485e" }} />
                孤立文档<strong>{isolated.toLocaleString()}</strong>
              </p>
            </div>
          </div>
        </section>
      </div>
      <section className="content-card runtime-card">
        <div className="card-heading">
          <h3>
            <Zap size={17} />
            运行与性能
          </h3>
          <span>来自本次真实运行</span>
        </div>
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
            <span>数据读取 / 生成</span>
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
          统计基于文档投影与合并后的数值图，不将单次运行时间视为通用容量承诺。
          {data.skippedReferences > 0 &&
            ` 已略过 ${data.skippedReferences.toLocaleString()} 次文档内引用或不可解析引用。`}
        </p>
      </section>
      <div className="privacy-footnote">
        <Network size={15} />
        数据与图计算留在当前设备。渲染与数据库资源随插件本地加载。
      </div>
    </div>
  );
}
