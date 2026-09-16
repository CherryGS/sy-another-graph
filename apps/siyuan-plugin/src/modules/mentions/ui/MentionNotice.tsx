import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";
import type { MentionMode } from "../types";
import type { MentionStatusView } from "./types";

export function MentionNotice({ mode, status }: { mode: MentionMode; status: MentionStatusView }) {
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
              重试文本提及
            </Button>
          </>
        ) : !ready ? (
          <>
            <Spinner />
            <span>
              正在建立文本提及索引：{progress.scanned.toLocaleString()} /{" "}
              {progress.total.toLocaleString()}。完成后加入提及关系。
            </span>
          </>
        ) : pending ? (
          <>
            <Spinner />
            <span>正在更新文本提及关系…</span>
          </>
        ) : (
          <>
            {result.truncated && <span>文本提及达到显示上限，结果已截断。</span>}
            {progress.skippedSources > 0 && (
              <span>
                {progress.skippedSources.toLocaleString()} 个正文块过大或正文不可用，未纳入索引。
              </span>
            )}
            {progress.limitedSources > 0 && (
              <span>
                {progress.limitedSources.toLocaleString()}{" "}
                个正文块的命中达到索引上限，结果可能不完整。
              </span>
            )}
            {progress.skippedKeywords > 0 && (
              <span>
                {progress.skippedKeywords.toLocaleString()} 项名称无可匹配文字、过长或超出索引上限。
              </span>
            )}
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
