import { Fragment, useEffect, useId, useMemo, useState } from "react";
import { cn } from "cn";
import type { GraphDataset } from "../../../core/graph/types";
import { useLocale } from "../../../shared/i18n/react";
import { t, text } from "../../../shared/i18n/runtime";
import { Button } from "../../../shared/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../../../shared/ui/field";
import { Textarea } from "../../../shared/ui/textarea";
import { Separator } from "../../../shared/ui/separator";
import { FieldHelp } from "../../../shared/ui/field-help";
import {
  CONTENT_EXCLUSION_LIMIT,
  formatContentExclusionDraft,
  normalizeContentExclusions,
  parseContentExclusionDraft,
  readContentExclusions,
  type ContentExclusionRule,
  type ExclusionScope,
} from "../rules";
import { ContentExclusionPreview } from "./ContentExclusionPreview";

const SCOPES: ExclusionScope[] = ["document", "subtree"];
const draftsFor = (rules: readonly ContentExclusionRule[]) => ({
  document: formatContentExclusionDraft(rules, "document"),
  subtree: formatContentExclusionDraft(rules, "subtree"),
});

export function ContentExclusions({
  data,
  rules,
  status,
  onApply,
  onOpen,
  hideTitle = false,
  onDraftChange,
}: {
  data: GraphDataset | null;
  rules: readonly ContentExclusionRule[];
  status: { error: string; retry: () => void };
  onApply: (rules: ContentExclusionRule[]) => void;
  onOpen: (id: string) => void;
  hideTitle?: boolean;
  onDraftChange?: (changed: boolean) => void;
}) {
  useLocale();
  const id = useId();
  const [drafts, setDrafts] = useState(() => draftsFor(rules));
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Preset application/reset replaces editable drafts.
    setDrafts(draftsFor(rules));
  }, [rules]);
  const parsed = useMemo(
    () => ({
      document: parseContentExclusionDraft(drafts.document, "document"),
      subtree: parseContentExclusionDraft(drafts.subtree, "subtree"),
    }),
    [drafts],
  );
  const combined = useMemo(
    () =>
      parsed.document.value && parsed.subtree.value
        ? readContentExclusions([...parsed.document.value, ...parsed.subtree.value])
        : null,
    [parsed],
  );
  const limitError = parsed.document.value && parsed.subtree.value && !combined;
  const changed =
    combined !== null &&
    JSON.stringify(combined) !== JSON.stringify(normalizeContentExclusions(rules));
  useEffect(() => {
    onDraftChange?.(changed || combined === null);
  }, [changed, combined, onDraftChange]);
  return (
    <FieldSet className="gap-4">
      <FieldLegend className={cn(hideTitle && "sr-only")}>
        {t("contentExclusions.title")}
      </FieldLegend>
      <div className="flex items-start justify-between gap-4">
        <FieldDescription>{t("contentExclusions.syntaxShort")}</FieldDescription>
        <FieldHelp label={t("contentExclusions.ruleHelp")}>
          <FieldDescription>{t("contentExclusions.syntax")}</FieldDescription>
          <FieldDescription>{t("contentExclusions.documentDescription")}</FieldDescription>
          <FieldDescription>{t("contentExclusions.subtreeDescription")}</FieldDescription>
        </FieldHelp>
      </div>
      {/* Vertical fields do not need size queries; Chromium can otherwise lose
          their layout inside a fieldset when asynchronous preview rows appear. */}
      <FieldGroup className="grid grid-cols-1 gap-4 [container-type:normal] min-[540px]:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]">
        {SCOPES.map((scope) => (
          <Fragment key={scope}>
            {scope === "subtree" && (
              <>
                <Separator className="min-[540px]:hidden" />
                <Separator orientation="vertical" className="hidden min-[540px]:block" />
              </>
            )}
            <Field data-invalid={!!parsed[scope].error} className="min-w-0 gap-3">
              <FieldLabel htmlFor={`${id}-${scope}`}>
                {t(
                  scope === "document"
                    ? "contentExclusions.documentLabelShort"
                    : "contentExclusions.subtreeLabelShort",
                )}
              </FieldLabel>
              <FieldDescription id={`${id}-${scope}-description`}>
                {t(
                  scope === "document"
                    ? "contentExclusions.documentHint"
                    : "contentExclusions.subtreeHint",
                )}
              </FieldDescription>
              <Textarea
                id={`${id}-${scope}`}
                rows={5}
                className="mt-auto min-h-32 max-h-80"
                value={drafts[scope]}
                placeholder={t(
                  scope === "document"
                    ? "contentExclusions.documentPlaceholder"
                    : "contentExclusions.subtreePlaceholder",
                )}
                onChange={(event) => {
                  const value = event.target.value;
                  setDrafts((previous) => ({ ...previous, [scope]: value }));
                }}
                aria-invalid={!!parsed[scope].error}
                aria-describedby={`${id}-${scope}-description${parsed[scope].error ? ` ${id}-${scope}-error` : ""}`}
              />
              {parsed[scope].error && (
                <FieldError id={`${id}-${scope}-error`}>{text(parsed[scope].error)}</FieldError>
              )}
            </Field>
          </Fragment>
        ))}
      </FieldGroup>
      {limitError && (
        <FieldError>{t("contentExclusions.limit", { count: CONTENT_EXCLUSION_LIMIT })}</FieldError>
      )}
      <Separator />
      <FieldGroup className="gap-3 [container-type:normal]">
        <ContentExclusionPreview data={data} rules={combined} onOpen={onOpen} />
        <Button
          variant="outline"
          className="w-full"
          disabled={!changed}
          onClick={() => {
            if (combined) onApply(combined);
          }}
        >
          {t("text.applyExclusions")}
        </Button>
        {changed && <FieldDescription>{t("filter.unappliedHint")}</FieldDescription>}
        {status.error && (
          <>
            <FieldError>{status.error}</FieldError>
            <Button variant="outline" size="sm" className="w-full" onClick={status.retry}>
              {t("contentExclusions.retry")}
            </Button>
          </>
        )}
      </FieldGroup>
    </FieldSet>
  );
}
