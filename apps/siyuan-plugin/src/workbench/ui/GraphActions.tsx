import { useLocale } from "../../shared/i18n/react";
import { t } from "../../shared/i18n/runtime";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";
import { SettingsPanel } from "./appearance/SettingsPanel";
import type { WorkbenchState } from "../model/state";

export function GraphActions({ state }: { state: WorkbenchState }) {
  useLocale();
  return (
    <div className="graph-actions">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("text.refreshGraph")}
        title={t("text.refreshWorkspaceData")}
        onClick={() => void state.load()}
      >
        {state.loading ? <Spinner /> : <RefreshCw />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title={t("text.exportTheCurrentGraphAsJson")}
        aria-label={t("text.exportCurrentGraph")}
        disabled={!state.data || !!state.loading || state.exporting}
        onClick={() => void state.exportGraph()}
      >
        {state.exporting ? <Spinner /> : <Download />}
      </Button>
      <SettingsPanel state={state} />
    </div>
  );
}
