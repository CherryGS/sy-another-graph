import type { GraphDataset } from "../data/types";

export function readReport(data: GraphDataset): string {
  const lines = ["Atlas graph read diagnostics", `Read at: ${data.loadedAt}`, `Read time: ${data.loadMs.toFixed(1)} ms`,
    `Nodes: ${data.nodes.length}; relationships: ${data.edges.length}; source references: ${data.referenceCount}`,
    `Issue categories: ${data.warnings.length}`, "", "Details refer to the acquired workspace index, before graph display filters."];
  for (const issue of data.warnings) {
    lines.push("", `[${issue.code}] ${issue.title}`, issue.summary, `影响：${issue.impact}`, `建议：${issue.suggestion}`,
      `明细：${issue.details.length} / ${issue.detailCount}（每类最多保留 20 条，长值会标注截断）`);
    issue.details.forEach((detail, index) => {
      lines.push(`  ${index + 1}.`, ...Object.entries(detail.fields).map(([label, value]) => `    ${label}: ${value}`));
      if (detail.openBlockId) lines.push(`    来源块: ${detail.openBlockId}`);
    });
  }
  return lines.join("\n");
}
