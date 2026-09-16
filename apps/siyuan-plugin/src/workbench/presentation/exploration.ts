import type { ExplorationSummary } from "../../application/sessions/exploration-result";

export function explorationLabel(result: ExplorationSummary | null): string {
  if (!result) return "";
  if (result.kind === "path") return `最短路径 · ${result.steps} 步`;
  const direction =
    result.direction === "out" ? "沿箭头" : result.direction === "in" ? "逆箭头" : "双向";
  return `${result.depth} 跳 · ${direction}${result.truncated ? " · 已达邻域节点预算，结果已截断" : ""}`;
}
