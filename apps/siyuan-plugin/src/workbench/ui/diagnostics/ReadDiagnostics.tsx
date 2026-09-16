import { readIssueText } from "../../presentation/read-issues";
import { useLocale } from "../../../shared/i18n/react";
import { t, text, dateTime } from "../../../shared/i18n/runtime";
import { useEffect, useRef } from "react";
import { ChevronDown, Copy, ExternalLink, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Spinner } from "@/shared/ui/spinner";
import { NativePreviewButton } from "../inspector/NativePreviewButton";
import { readReport } from "../../model/read-report";
import type { WorkbenchState } from "../../model/state";

const TOAST_ID = "atlas-read-issues";

export function ReadDiagnostics({ state }: { state: WorkbenchState }) {
  const language = useLocale();
  const { data, readIssuesOpen, setReadIssuesOpen } = state;
  const previous = useRef("");
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const signature = `${language}:${JSON.stringify(data?.warnings ?? [])}`;
    if (signature === previous.current) return;
    previous.current = signature;
    if (!data?.warnings.length) {
      toast.dismiss(TOAST_ID);
      return;
    }
    toast.warning(t("text.graphReadNoticesValue", { p0: data.warnings.length }), {
      id: TOAST_ID,
      position: "bottom-left",
      duration: 10_000,
      description: t("text.someRelationshipsMayBeIncompleteInspectTheAffected"),
      action: { label: t("text.viewDetails"), onClick: () => setReadIssuesOpen(true) },
    });
  }, [data, setReadIssuesOpen, language]);
  useEffect(
    () => () => {
      toast.dismiss(TOAST_ID);
    },
    [],
  );

  const copyReport = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(readReport(data));
      toast.success(t("text.readReportCopied"));
    } catch {
      toast.error(t("text.cannotAccessTheClipboardSelectAndCopyThe"));
    }
  };
  return (
    <>
      {!!data?.warnings.length && (
        <div className="read-issues-trigger">
          <Button
            ref={trigger}
            variant="secondary"
            size="xs"
            onClick={() => setReadIssuesOpen(true)}
            aria-label={t("text.readNoticesValueViewDetails", { p0: data.warnings.length })}
          >
            <TriangleAlert data-icon="inline-start" />
            {t("diagnostics.noticeCount", { count: data.warnings.length })}
          </Button>
        </div>
      )}
      <Dialog open={readIssuesOpen} onOpenChange={setReadIssuesOpen}>
        <DialogContent
          className="flex max-h-[85vh] flex-col sm:max-w-3xl"
          onCloseAutoFocus={(event) => {
            if (trigger.current) {
              event.preventDefault();
              trigger.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("text.graphReadDetails")}</DialogTitle>
            <DialogDescription>
              {data
                ? t("text.readAtValueValueMs", {
                    p0: dateTime(data.loadedAt),
                    p1: data.loadMs.toFixed(0),
                  })
                : t("text.noCompletedReadYet")}
              {state.loading && t("text.refreshingShowingTheLastCompletedRead")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto" data-scroll-panel>
            <p className="text-sm text-muted-foreground">
              {t("text.theseDiagnosticsConcernTheAcquiredWorkspaceIndexIndependently")}
            </p>
            {data?.warnings.map(readIssueText).map((issue) => (
              <Alert key={issue.code}>
                <TriangleAlert />
                <AlertTitle>{issue.title}</AlertTitle>
                <AlertDescription className="gap-3">
                  <p>{issue.summary}</p>
                  <p>{t("diagnostics.impact", { detail: issue.impact })}</p>
                  <p>{t("diagnostics.suggestion", { detail: issue.suggestion })}</p>
                  <Collapsible defaultOpen={issue.detailCount <= 3} className="w-full min-w-0">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">
                        {t("diagnostics.detailCount", {
                          shown: issue.details.length,
                          total: issue.detailCount,
                        })}
                        <ChevronDown data-icon="inline-end" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="flex flex-col gap-4 pt-2">
                      {issue.details.map((detail, index) => (
                        <div key={index} className="flex min-w-0 flex-col gap-2">
                          <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
                            {Object.entries(detail.fields).map(([label, value]) => (
                              <div key={label} className="contents">
                                <dt className="text-muted-foreground">{text({ code: label })}</dt>
                                <dd className="whitespace-pre-wrap break-all">{text(value)}</dd>
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
                              {text(detail.openLabel) || t("text.openSource")}
                            </NativePreviewButton>
                          )}
                        </div>
                      ))}
                      {issue.detailCount > issue.details.length && (
                        <p>
                          {t("diagnostics.omitted", {
                            count: issue.detailCount - issue.details.length,
                            shown: issue.details.length,
                          })}
                        </p>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </AlertDescription>
              </Alert>
            ))}
            {data && !data.warnings.length && <p>{t("text.noIssuesWereDetectedInThisRead")}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={!data} onClick={() => void copyReport()}>
              <Copy data-icon="inline-start" />
              {t("text.copyReport")}
            </Button>
            <Button disabled={!!state.loading} onClick={() => void state.load()}>
              {state.loading ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              {t("text.refreshData")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
