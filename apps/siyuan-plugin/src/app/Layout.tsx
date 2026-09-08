import { useState } from "react";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  Activity,
  Bookmark,
  Check,
  Download,
  LoaderCircle,
  Network,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { ExplorePage } from "./ExplorePage";
import { useHostVisibility } from "./host-visibility";
import { useWorkbench } from "./state";

export function Layout() {
  const state = useWorkbench();
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState("");
  const isExplore = useLocation({
    select: (location) => location.pathname === "/",
  });
  const hostActive = useHostVisibility();
  return (
    <div
      className="workbench"
      data-host-active={hostActive}
      data-snapshot={state.data?.loadedAt}
    >
      <header className="app-toolbar">
        <nav className="main-nav" aria-label="图谱导航">
          <Link
            to="/"
            activeProps={{ className: "active" }}
            activeOptions={{ exact: true, includeSearch: false }}
          >
            <Network size={15} />
            图谱
          </Link>
          <Link
            to="/insights"
            activeOptions={{ exact: true, includeSearch: false }}
            activeProps={{ className: "active" }}
          >
            <Activity size={15} />
            洞察
          </Link>
          <Link
            to="/saved"
            activeOptions={{ exact: true, includeSearch: false }}
            activeProps={{ className: "active" }}
          >
            <Bookmark size={15} />
            已保存
            {state.savedViews.length > 0 && (
              <span className="nav-count">{state.savedViews.length}</span>
            )}
          </Link>
        </nav>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label="刷新图谱"
            title="重新读取工作空间"
            onClick={() => void state.load()}
          >
            <RefreshCw size={15} className={state.loading ? "spin" : ""} />
          </button>
          <button
            className="icon-button"
            title="导出当前图谱 JSON"
            aria-label="导出当前图谱"
            disabled={!state.data || !!state.loading || state.exporting}
            onClick={() => void state.exportGraph()}
          >
            {state.exporting ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Download size={15} />
            )}
          </button>
          <button
            className="icon-button"
            aria-label="保存视图"
            title="保存视图"
            disabled={!state.data || !!state.loading}
            onClick={() => {
              setViewName(`视图 ${state.savedViews.length + 1}`);
              setSaving(true);
            }}
          >
            <Save size={15} />
          </button>
        </div>
      </header>
      {state.exportFile && (
        <div className="export-banner" role="status">
          <span>
            JSON · {state.exportFile.nodesCount.toLocaleString()} 节点 ·{" "}
            {state.exportFile.edgesCount.toLocaleString()} 关系
          </span>
          <a href={state.exportFile.url} download={state.exportFile.name}>
            <Download size={13} />
            下载 JSON
          </a>
          <button
            className="icon-button"
            aria-label="关闭下载提示"
            onClick={state.dismissExport}
          >
            <X size={13} />
          </button>
        </div>
      )}
      {state.data?.warnings.map((warning) => (
        <div key={warning} className="warning-banner">
          {warning}
        </div>
      ))}
      <main className="main-content">
        <div
          className="route-layer graph-route"
          data-route-active={isExplore}
          aria-hidden={!isExplore}
          inert={!isExplore}
        >
          <ExplorePage active={isExplore && hostActive} />
        </div>
        {!isExplore && (
          <div className="route-layer auxiliary-route">
            <Outlet />
          </div>
        )}
      </main>
      {state.toast && (
        <div className="toast" role="status">
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
            <h2 id="save-title">保存视图</h2>
            <p>保留筛选条件与当前查看节点，存于当前浏览器。</p>
            <label htmlFor="view-name">名称</label>
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
                <Check size={14} />
                保存
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
