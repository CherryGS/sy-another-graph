import { t } from "../../shared/i18n/runtime";
import type { ExplorationSummary } from "../../application/sessions/exploration-result";

export function explorationLabel(result: ExplorationSummary | null): string {
  if (!result) return "";
  if (result.kind === "path") return t("text.shortestPathStepsValue", { p0: result.steps });
  const direction =
    result.direction === "out"
      ? t("text.alongArrows")
      : result.direction === "in"
        ? t("text.againstArrows")
        : t("text.bothWays");
  return t("text.hopsValueValueValue", {
    p0: result.depth,
    p1: direction,
    p2: result.truncated ? t("text.neighborhoodBudgetReachedResultsTruncated") : "",
  });
}
