import { t } from "../../shared/i18n/runtime";
import type { SourceProgress } from "../../core/diagnostics/progress";

export function sourceProgress(progress: SourceProgress | null): string {
  if (!progress) return "";
  switch (progress.phase) {
    case "preparing":
      return t("text.preparingGraphData2");
    case "notebooks":
      return t("text.readingSiyuanNotebooks");
    case "blocks":
      return t("text.readingBlocksValueValue", { p0: progress.completed, p1: progress.total });
    case "databases":
      return t("text.readingDatabasesValueValue", { p0: progress.completed, p1: progress.total });
    case "references":
      return t("text.aggregatingReferencesValueValueRecordsValueRelationships", {
        p0: progress.completed,
        p1: progress.total,
        p2: progress.groups,
      });
  }
}
