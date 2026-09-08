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
          <span className="eyebrow">SAVED PERSPECTIVES</span>
          <h2>保留值得回访的视角</h2>
          <p>保存筛选条件与选中文档，随时继续探索。视图存于当前浏览器。</p>
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
                <Bookmark size={22} />
                <span>
                  {saved.source === "siyuan" ? "思源图谱" : "合成图谱"}
                </span>
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
          <Bookmark size={44} />
          <h3>为下一次灵感留个书签</h3>
          <p>在图谱中找到一个有意思的视角，点击右上角「保存视图」。</p>
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
