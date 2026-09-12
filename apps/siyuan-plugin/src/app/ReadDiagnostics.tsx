import { useEffect, useRef } from "react";
import { ChevronDown, Copy, ExternalLink, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { NativePreviewButton } from "./NativePreviewButton";
import { readReport } from "./read-report";
import type { WorkbenchState } from "./state";

const TOAST_ID = "atlas-read-issues";

export function ReadDiagnostics({ state }: { state: WorkbenchState }) {
  const { data, readIssuesOpen, setReadIssuesOpen } = state;
  const previous = useRef("");
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const signature = JSON.stringify(data?.warnings ?? []);
    if (signature === previous.current) return;
    previous.current = signature;
    if (!data?.warnings.length) { toast.dismiss(TOAST_ID); return; }
    toast.warning(`图谱读取有 ${data.warnings.length} 项提示`, {
      id: TOAST_ID,
      position: "bottom-left",
      duration: 10_000,
      description: "部分关系可能不完整。查看具体对象、原因与来源。",
      action: { label: "查看详情", onClick: () => setReadIssuesOpen(true) },
    });
  }, [data, setReadIssuesOpen]);
  useEffect(() => () => { toast.dismiss(TOAST_ID); }, []);

  const copyReport = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(readReport(data));
      toast.success("读取报告已复制");
    } catch {
      toast.error("无法访问剪贴板，可以直接选择并复制弹窗中的明细。");
    }
  };
  return (
    <>
      {!!data?.warnings.length && (
        <div className="read-issues-trigger">
          <Button ref={trigger} variant="secondary" size="xs" onClick={() => setReadIssuesOpen(true)} aria-label={`读取提示：${data.warnings.length} 项，查看详情`}>
            <TriangleAlert data-icon="inline-start" />读取提示 {data.warnings.length}
          </Button>
        </div>
      )}
      <Dialog open={readIssuesOpen} onOpenChange={setReadIssuesOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl" onCloseAutoFocus={event => {
          if (trigger.current) { event.preventDefault(); trigger.current.focus(); }
        }}>
          <DialogHeader>
            <DialogTitle>图谱读取详情</DialogTitle>
            <DialogDescription>
              {data ? `读取时间 ${new Date(data.loadedAt).toLocaleString("zh-CN")} · ${data.loadMs.toFixed(0)} ms` : "尚未完成读取"}
              {state.loading && " · 正在重新读取，下面是上次完成的结果"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto" data-scroll-panel>
            <p className="text-sm text-muted-foreground">以下诊断针对本次工作空间索引读取，不受图谱显示筛选影响。每类最多保留 20 条明细，影响总数完整计数。</p>
            {data?.warnings.map(issue => (
              <Alert key={issue.code}>
                <TriangleAlert />
                <AlertTitle>{issue.title}</AlertTitle>
                <AlertDescription className="gap-3">
                  <p>{issue.summary}</p>
                  <p>影响：{issue.impact}</p>
                  <p>建议：{issue.suggestion}</p>
                  <Collapsible defaultOpen={issue.detailCount <= 3} className="w-full min-w-0">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">
                        明细 {issue.details.length} / {issue.detailCount}
                        <ChevronDown data-icon="inline-end" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="flex flex-col gap-4 pt-2">
                      {issue.details.map((detail, index) => (
                        <div key={index} className="flex min-w-0 flex-col gap-2">
                          <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
                            {Object.entries(detail.fields).map(([label, value]) => (
                              <div key={label} className="contents">
                                <dt className="text-muted-foreground">{label}</dt>
                                <dd className="whitespace-pre-wrap break-all">{value}</dd>
                              </div>
                            ))}
                          </dl>
                          {detail.openBlockId && (
                            <NativePreviewButton
                              nativeId={detail.openBlockId}
                              variant="outline"
                              size="sm"
                              className="self-start"
                              onClick={() => state.openReadIssueSource(detail.openBlockId!)}
                            >
                              <ExternalLink data-icon="inline-start" />
                              {detail.openLabel || "打开来源"}
                            </NativePreviewButton>
                          )}
                        </div>
                      ))}
                      {issue.detailCount > issue.details.length && <p>另有 {issue.detailCount - issue.details.length} 条明细未保留，以上为前 {issue.details.length} 条。</p>}
                    </CollapsibleContent>
                  </Collapsible>
                </AlertDescription>
              </Alert>
            ))}
            {data && !data.warnings.length && <p>本次读取未发现需要提示的问题。</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={!data} onClick={() => void copyReport()}><Copy data-icon="inline-start" />复制报告</Button>
            <Button disabled={!!state.loading} onClick={() => void state.load()}>
              {state.loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
              重新读取
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
