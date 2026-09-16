import { useLocale } from "../../../shared/i18n/react";
import { t } from "../../../shared/i18n/runtime";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";
import type { MentionMode } from "../types";
import type { MentionStatusView } from "./types";

export function MentionNotice({ mode, status }: { mode: MentionMode; status: MentionStatusView }) {
  useLocale();
  if (mode === "off") return null;
  const { progress, pending, ready, error, result } = status;
  const incomplete =
    progress.skippedSources + progress.limitedSources + progress.skippedKeywords > 0;
  if (!error && ready && !pending && !incomplete && !result.truncated) return null;
  return (
    <Alert variant={error ? "destructive" : "default"} className="rounded-none py-2">
      <AlertDescription
        className="flex flex-wrap items-center gap-2"
        role="status"
        aria-live="polite"
      >
        {error ? (
          <>
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={status.retry}>
              {t("text.retryTextMentions")}
            </Button>
          </>
        ) : !ready ? (
          <>
            <Spinner />
            <span>
              {t("mentions.indexNotice", { read: progress.scanned, total: progress.total })}
            </span>
          </>
        ) : pending ? (
          <>
            <Spinner />
            <span>{t("text.updatingTextMentionRelationships")}</span>
          </>
        ) : (
          <>
            {result.truncated && (
              <span>{t("text.textMentionsReachedTheDisplayLimitResultsWere")}</span>
            )}
            {progress.skippedSources > 0 && (
              <span>{t("mentions.skippedSources", { count: progress.skippedSources })}</span>
            )}
            {progress.limitedSources > 0 && (
              <span>{t("mentions.limitedSources", { count: progress.limitedSources })}</span>
            )}
            {progress.skippedKeywords > 0 && (
              <span>{t("mentions.skippedNames", { count: progress.skippedKeywords })}</span>
            )}
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
