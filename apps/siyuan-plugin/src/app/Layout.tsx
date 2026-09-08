import { useState } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import {
  Activity,
  Bookmark,
  Check,
  CheckCircle2,
  Download,
  LoaderCircle,
  Network,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { useWorkbench } from "./state";

export function Layout() {
  const state = useWorkbench();
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState("");
  return (
    <div className="workbench">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <Network size={23} strokeWidth={1.7} />
          </div>
          <div>
            <h1>
              Atlas<span>思源图谱</span>
            </h1>
            <p>连接知识，发现新的可能</p>
          </div>
        </div>
        <nav className="main-nav" aria-label="图谱导航">
          <Link
            to="/"
            activeProps={{ className: "active" }}
            activeOptions={{ exact: true }}
          >
            <Network size={16} />
            探索
          </Link>
          <Link to="/insights" activeProps={{ className: "active" }}>
            <Activity size={16} />
            洞察
          </Link>
          <Link to="/saved" activeProps={{ className: "active" }}>
            <Bookmark size={16} />
            已保存
            {state.savedViews.length > 0 && (
              <span className="nav-count">{state.savedViews.length}</span>
            )}
          </Link>
        </nav>
        <div className="header-actions">
          <button
            className="icon-button"
            title="导出当前图谱 JSON"
            aria-label="导出当前图谱"
            disabled={!state.data || !!state.loading || state.exporting}
            onClick={() => void state.exportGraph()}
          >
            {state.exporting ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Download size={17} />
            )}
          </button>
          <button
            className="save-button"
            disabled={!state.data || !!state.loading}
            onClick={() => {
              setViewName(`探索视图 ${state.savedViews.length + 1}`);
              setSaving(true);
            }}
          >
            <Save size={15} />
            保存视图
          </button>
        </div>
      </header>
      <div className="workspace-toolbar">
        <div className="workspace-picker">
          <span className="workspace-icon">
            <Network size={15} />
          </span>
          <label htmlFor="source-picker">数据来源</label>
          <select
            id="source-picker"
            value={state.source}
            onChange={(event) => void state.load(event.target.value)}
          >
            <option value="siyuan">当前思源工作空间</option>
            <option value="10000">规模测试 · 10,000 节点</option>
            <option value="100000">规模测试 · 100,000 节点</option>
          </select>
        </div>
        <div className="toolbar-summary">
          {state.loading ? (
            <>
              <LoaderCircle size={13} className="spin" />
              <span>正在更新</span>
            </>
          ) : state.data ? (
            <>
              <span>
                {state.data.nodes.length.toLocaleString()}
                <small>文档</small>
              </span>
              <span>
                {state.data.edges.length.toLocaleString()}
                <small>关系</small>
              </span>
            </>
          ) : (
            <span>等待数据</span>
          )}
          <button
            className="icon-button"
            aria-label="刷新图谱"
            title="刷新图谱"
            onClick={() => void state.load(state.source)}
          >
            <RefreshCw size={15} className={state.loading ? "spin" : ""} />
          </button>
        </div>
      </div>
      {state.exportFile && (
        <div className="export-banner" role="status">
          <CheckCircle2 size={15} />
          <span>
            JSON 快照已生成 · {state.exportFile.nodesCount.toLocaleString()}{" "}
            节点 · {state.exportFile.edgesCount.toLocaleString()} 关系
          </span>
          <a href={state.exportFile.url} download={state.exportFile.name}>
            <Download size={14} />
            下载 JSON
          </a>
        </div>
      )}
      {state.data?.warnings.map((warning) => (
        <div key={warning} className="warning-banner">
          {warning}
        </div>
      ))}
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="status-bar">
        <span>
          <i className={`live-dot ${state.error ? "failed" : ""}`} />
          {state.error
            ? "数据连接异常"
            : state.loading
              ? state.loading
              : state.stats
                ? `${state.stats.backend} · ${state.stats.transport === "shared" ? "共享缓冲区" : "Transferable"}`
                : "准备就绪"}
        </span>
        <span>
          本地计算<span className="status-dot">·</span>
          <a href="https://cosmograph.app/" target="_blank" rel="noreferrer">
            Powered by Cosmograph
          </a>
        </span>
      </footer>
      {state.toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          <span>{state.toast}</span>
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => state.setToast("")}
          >
            <X size={13} />
          </button>
        </div>
      )}
      {saving && (
        <div className="modal-backdrop" onClick={() => setSaving(false)}>
          <form
            className="save-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              state.saveView(viewName);
              setSaving(false);
            }}
          >
            <div className="dialog-icon">
              <Bookmark size={23} />
            </div>
            <h2 id="save-title">保存这个探索视角</h2>
            <p>保留笔记本、关系筛选和当前选中文档。</p>
            <label htmlFor="view-name">视图名称</label>
            <input
              autoFocus
              id="view-name"
              maxLength={80}
              value={viewName}
              onChange={(event) => setViewName(event.target.value)}
            />
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSaving(false)}
              >
                取消
              </button>
              <button className="primary-button" type="submit">
                <Check size={15} />
                保存视图
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
