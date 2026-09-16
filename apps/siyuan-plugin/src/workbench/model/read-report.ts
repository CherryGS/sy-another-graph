import { readIssueText } from "../presentation/read-issues";
import { t, text, dateTime } from "../../shared/i18n/runtime";
import type { GraphDataset } from "../../core/graph/types";

export function readReport(data: GraphDataset): string {
  const lines = [
    t("text.readDiagnostics"),
    t("report.readAt", { date: `${dateTime(data.loadedAt)} (${data.loadedAt})` }),
    t("report.duration", { duration: data.loadMs.toFixed(1) }),
    t("report.counts", {
      nodes: data.nodes.length,
      edges: data.edges.length,
      references: data.referenceCount,
    }),
    t("report.categories", { count: data.warnings.length }),
    "",
    t("report.scope"),
  ];
  for (const issue of data.warnings.map(readIssueText)) {
    lines.push(
      "",
      `[${issue.code}] ${issue.title}`,
      issue.summary,
      t("text.impactValue", { p0: issue.impact }),
      t("text.suggestionValue", { p0: issue.suggestion }),
      t("text.detailsValueValueUpTo20PerCategory", {
        p0: issue.details.length,
        p1: issue.detailCount,
      }),
    );
    issue.details.forEach((detail, index) => {
      lines.push(
        `  ${index + 1}.`,
        ...Object.entries(detail.fields).map(
          ([label, value]) => `    ${text({ code: label })}: ${text(value)}`,
        ),
      );
      if (detail.openBlockId) lines.push(t("text.sourceBlockValue", { p0: detail.openBlockId }));
    });
  }
  return lines.join("\n");
}
