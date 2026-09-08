import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Bookmark, Clock3, RotateCcw, Trash2 } from "lucide-react";
import type { SavedView } from "../data/views";
import { useWorkbench } from "./state";

export function SavedPage() {
  const state = useWorkbench();
  const navigate = useNavigate();
  const [deleted, setDeleted] = useState<SavedView | null>(null);
  return (
    <div className="scroll-page">
      <div className="page-title">
        <div>
          <h2>保存的视图</h2>
        </div>
        <span className="source-chip">{state.savedViews.length} 个视图</span>
      </div>
      {deleted && (
        <div className="undo-banner">
          <span>已移除「{deleted.name}」</span>
          <button
            onClick={() => {
              if (state.persistViews([deleted, ...state.savedViews]))
                setDeleted(null);
            }}
          >
            <RotateCcw size={14} />
            撤销
          </button>
        </div>
      )}
      {state.savedViews.length ? (
        <div className="saved-grid">
          {state.savedViews.map((saved) => (
            <article className="saved-card" key={saved.id}>
              <div className="saved-card-art">
                <Bookmark size={14} />
                <span>思源图谱</span>
              </div>
              <h3>{saved.name}</h3>
              <p>
                {saved.filters.notebook
                  ? state.data?.notebooks.find(
                      (book) => book.id === saved.filters.notebook,
                    )?.name || "指定笔记本"
                  : "全部笔记本"}{" "}
                · {saved.filters.references ? "引用" : ""}
                {saved.filters.hierarchy ? " + 层级" : ""}
              </p>
              <div className="saved-meta">
                <Clock3 size={13} />
                {new Date(saved.createdAt).toLocaleString("zh-CN")}
              </div>
              <div className="saved-actions">
                <button
                  className="secondary-button"
                  disabled={!!state.loading}
                  onClick={() => {
                    void state.restoreView(saved).then((restored) => {
                      if (restored) void navigate({ to: "/" });
                    });
                  }}
                >
                  继续探索
                  <ArrowRight size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`移除视图 ${saved.name}`}
                  onClick={() => {
                    if (
                      state.persistViews(
                        state.savedViews.filter((item) => item.id !== saved.id),
                      )
                    )
                      setDeleted(saved);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="page-empty saved-empty">
          <Bookmark size={28} />
          <h3>暂无保存的视图</h3>
          <p>在图谱工具栏中保存筛选条件与当前查看节点。</p>
          <button
            className="primary-button"
            onClick={() => void navigate({ to: "/" })}
          >
            开始探索
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
