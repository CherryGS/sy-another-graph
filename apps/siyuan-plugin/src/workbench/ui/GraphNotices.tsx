import { useLocale } from "../../shared/i18n/react";
import { t } from "../../shared/i18n/runtime";
import { Download, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import type { WorkbenchState } from "../model/state";

export function GraphNotices({ state }: { state: WorkbenchState }) {
  useLocale();
  return (
    <>
      {state.exportFile && (
        <Alert className="export-banner rounded-none border-x-0 border-t-0">
          <AlertDescription className="flex w-full flex-row flex-wrap items-center justify-between gap-2">
            <span>
              JSON ·{" "}
              {t("graph.counts", {
                nodes: state.exportFile.nodesCount,
                edges: state.exportFile.edgesCount,
              })}
            </span>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={state.exportFile.url} download={state.exportFile.name}>
                  <Download data-icon="inline-start" />
                  {t("text.downloadJson")}
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("text.dismissDownloadNotice")}
                onClick={state.dismissExport}
              >
                <X />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
