import { useEffect, useMemo, useState } from "react";
import type { GraphDataset } from "../../../core/graph/types";
import { useLocale } from "../../../shared/i18n/react";
import { t } from "../../../shared/i18n/runtime";
import { Button } from "../../../shared/ui/button";
import {
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "../../../shared/ui/field";
import { FieldHelp } from "../../../shared/ui/field-help";
import { Separator } from "../../../shared/ui/separator";
import { usePrioritySorting } from "../../../shared/hooks/use-priority-sorting";
import {
  CONTENT_EXCLUSION_LIMIT,
  formatContentExclusionDraft,
  normalizeContentExclusions,
  parseContentExclusionDraft,
  readContentExclusions,
  type ContentExclusionRule,
} from "../rules";
import {
  moveExclusionStep,
  type ExclusionContext,
  type ExclusionPipeline,
} from "../pipeline-model";
import { useContentExclusions } from "../use-content-exclusions";
import { ExclusionStepCard } from "./ExclusionStepCard";

const draftsFor = (rules: readonly ContentExclusionRule[]) => ({
  document: formatContentExclusionDraft(rules, "document"),
  subtree: formatContentExclusionDraft(rules, "subtree"),
});

export function ContentExclusions({
  data,
  rules,
  context,
  status,
  onApply,
  onPipelineChange,
  onOpen,
  onLocate,
  canLocate,
  onDraftChange,
}: {
  data: GraphDataset | null;
  rules: readonly ContentExclusionRule[];
  context: ExclusionContext;
  status: ReturnType<typeof useContentExclusions>;
  onApply: (rules: ContentExclusionRule[]) => void;
  onPipelineChange: (pipeline: ExclusionPipeline) => void;
  onOpen: (id: string) => void;
  onLocate: (id: string) => void;
  canLocate: (id: string) => boolean;
  onDraftChange?: (changed: boolean) => void;
}) {
  useLocale();
  const [drafts, setDrafts] = useState(() => draftsFor(rules));
  const appliedKey = JSON.stringify(rules);
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Applied rules/reset replace drafts; ordering does not.
    setDrafts(draftsFor(JSON.parse(appliedKey) as ContentExclusionRule[]));
  }, [appliedKey]);
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
  const changed =
    combined !== null &&
    JSON.stringify(combined) !== JSON.stringify(normalizeContentExclusions(rules));
  useEffect(() => {
    onDraftChange?.(changed || combined === null);
  }, [changed, combined, onDraftChange]);
  const draftPreview = useContentExclusions(data, changed ? combined : null, 400, context);
  const preview = changed ? draftPreview : status;
  const result = combined ? preview.result : null;
  const move = (id: string, destination: number) =>
    onPipelineChange(moveExclusionStep(context.pipeline, id, destination));
  const { listRef, drop, handle } = usePrioritySorting(move);
  return (
    <FieldSet className="gap-4">
      <FieldLegend className="sr-only">{t("contentExclusions.title")}</FieldLegend>
      <div className="flex items-start justify-between gap-3">
        <FieldDescription>{t("contentExclusions.orderHint")}</FieldDescription>
        <FieldHelp label={t("contentExclusions.ruleHelp")}>
          <FieldDescription>{t("contentExclusions.syntax")}</FieldDescription>
          <FieldDescription>{t("contentExclusions.countScope")}</FieldDescription>
          <FieldDescription>{t("contentExclusions.emptyDescription")}</FieldDescription>
        </FieldHelp>
      </div>
      <div
        ref={listRef}
        role="list"
        aria-label={t("contentExclusions.order")}
        className="flex flex-col gap-3"
      >
        {context.pipeline.order.map((kind, index) => (
          <ExclusionStepCard
            key={kind}
            kind={kind}
            index={index}
            pipeline={context.pipeline}
            onPipelineChange={onPipelineChange}
            move={move}
            sortHandle={handle}
            drop={drop?.id === kind ? drop : null}
            draft={kind === "empty" ? "" : drafts[kind]}
            error={kind === "empty" ? null : parsed[kind].error}
            onDraft={(value) => {
              if (kind !== "empty") setDrafts((previous) => ({ ...previous, [kind]: value }));
            }}
            data={data}
            impact={result?.steps?.find((step) => step.kind === kind)}
            pending={preview.pending}
            valid={!!combined && !preview.error}
            onOpen={onOpen}
            onLocate={onLocate}
            canLocate={canLocate}
          />
        ))}
      </div>
      {parsed.document.value && parsed.subtree.value && !combined && (
        <FieldError>{t("contentExclusions.limit", { count: CONTENT_EXCLUSION_LIMIT })}</FieldError>
      )}
      <Separator />
      <FieldGroup className="gap-3 [container-type:normal]">
        <FieldDescription aria-live="polite">
          {preview.pending
            ? t("contentExclusions.previewPending")
            : result
              ? t("contentExclusions.total", {
                  count: (result.steps ?? []).reduce(
                    (sum, step) => sum + step.removedIds.length,
                    0,
                  ),
                })
              : ""}
        </FieldDescription>
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
        {changed && <FieldDescription>{t("contentExclusions.draftCounts")}</FieldDescription>}
        {preview.error && (
          <>
            <FieldError>{preview.error}</FieldError>
            <Button variant="outline" size="sm" className="w-full" onClick={preview.retry}>
              {t("contentExclusions.retry")}
            </Button>
          </>
        )}
      </FieldGroup>
    </FieldSet>
  );
}
