import { useLocale } from "../../shared/i18n/react";
import { t } from "../../shared/i18n/runtime";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/ui/empty";
import { Spinner } from "@/shared/ui/spinner";

interface GraphCanvasStateProps {
  error: string | null;
  loading: boolean;
  initializing: boolean;
  preparing: boolean;
  nodeCount: number;
  onRetry(): void;
}

export function GraphCanvasState({
  error,
  loading,
  initializing,
  preparing,
  nodeCount,
  onRetry,
}: GraphCanvasStateProps) {
  useLocale();
  if (error)
    return (
      <div className="ag-canvas__state">
        <Alert variant="destructive">
          <AlertTitle>{t("text.theGraphCannotBeDisplayed")}</AlertTitle>
          <AlertDescription>
            <div className="flex flex-col items-start gap-3">
              <p>{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                {t("text.retryGraph")}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  if (loading)
    return (
      <div className="ag-canvas__state">
        <Alert role="status">
          <Spinner aria-hidden="true" className="motion-reduce:animate-none" />
          <AlertTitle>
            {initializing
              ? t("text.startingTheGraphEngine")
              : preparing
                ? t("text.preparingGraphData")
                : t("text.drawingKnowledgeConnections")}
          </AlertTitle>
          <AlertDescription>{t("canvas.localNodes", { count: nodeCount })}</AlertDescription>
        </Alert>
      </div>
    );
  if (nodeCount) return null;
  return (
    <div className="ag-canvas__state">
      <Empty className="border bg-card text-card-foreground" role="status">
        <EmptyHeader>
          <EmptyTitle>{t("text.noNodesInThisScope")}</EmptyTitle>
          <EmptyDescription>{t("text.adjustTheFiltersToExploreMoreNotes")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
