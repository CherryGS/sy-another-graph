import type { SourceProgress } from "../../core/diagnostics/progress";

export function sourceProgress(progress: SourceProgress | null): string {
  if (!progress) return "";
  switch (progress.phase) {
    case "preparing":
      return "准备图谱数据…";
    case "notebooks":
      return "正在读取思源笔记本…";
    case "blocks":
      return `正在读取块 · ${progress.completed.toLocaleString()} / ${progress.total.toLocaleString()}`;
    case "databases":
      return `正在读取数据库 · ${progress.completed.toLocaleString()} / ${progress.total.toLocaleString()}`;
    case "references":
      return `正在聚合引用 · ${progress.completed.toLocaleString()} / ${progress.total.toLocaleString()} 条 · ${progress.groups.toLocaleString()} 组关系`;
  }
}
