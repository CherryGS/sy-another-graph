import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";
import { SettingsPanel } from "./appearance/SettingsPanel";
import type { WorkbenchState } from "../model/state";

export function GraphActions({ state }: { state: WorkbenchState }) {
  return (
    <div className="graph-actions">
      <Button
        variant="ghost"
        size="icon"
        aria-label="刷新图谱"
        title="重新读取工作空间"
        onClick={() => void state.load()}
      >
        {state.loading ? <Spinner /> : <RefreshCw />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="导出当前图谱 JSON"
        aria-label="导出当前图谱"
        disabled={!state.data || !!state.loading || state.exporting}
        onClick={() => void state.exportGraph()}
      >
        {state.exporting ? <Spinner /> : <Download />}
      </Button>
      <SettingsPanel state={state} />
    </div>
  );
}
