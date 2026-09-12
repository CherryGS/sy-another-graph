import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { WorkbenchState } from "./state";

export function GraphNotices({ state }: { state: WorkbenchState }) {
  return (
    <>
      {state.exportFile && (
        <Alert className="export-banner rounded-none border-x-0 border-t-0">
          <AlertDescription className="flex w-full flex-row flex-wrap items-center justify-between gap-2">
            <span>
              JSON · {state.exportFile.nodesCount.toLocaleString()} 节点 ·{" "}
              {state.exportFile.edgesCount.toLocaleString()} 关系
            </span>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <a
                  href={state.exportFile.url}
                  download={state.exportFile.name}
                >
                  <Download data-icon="inline-start" />
                  下载 JSON
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="关闭下载提示"
                onClick={state.dismissExport}
              >
                <X />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {!!state.data?.warnings.length && (
        <Collapsible className="border-b">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
            >
              读取提示
              <Badge variant="outline">{state.data.warnings.length}</Badge>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent
            className="max-h-36 overflow-y-auto"
            data-scroll-panel
          >
            {state.data.warnings.map((warning) => (
              <Alert key={warning}>
                <AlertTitle>数据读取提示</AlertTitle>
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
}
