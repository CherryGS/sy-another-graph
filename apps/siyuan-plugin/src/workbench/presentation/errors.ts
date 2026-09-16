import { failureOf } from "../../core/diagnostics/message";
import { text, t } from "../../shared/i18n/runtime";

export function userMessage(failure: unknown): string {
  const detail = failure instanceof Error ? failureOf(failure) : failure;
  if (typeof detail !== "string") return text(detail);
  const message = detail;
  if (/Graph worker failed|Failed to fetch/i.test(message))
    return t("text.failedToLoadLocalGraphResourcesCheckThe");
  if (/timed out|timeout/i.test(message)) return t("text.theRequestTimedOutCheckTheConnectionAnd");
  return message;
}
