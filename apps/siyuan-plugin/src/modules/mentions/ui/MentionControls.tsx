import { useLocale } from "../../../shared/i18n/react";
import { t } from "../../../shared/i18n/runtime";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { Progress } from "@/shared/ui/progress";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { FieldHelp } from "@/shared/ui/field-help";
import { isMentionMode } from "../types";
import type { MentionControlsProps } from "./types";
import { MentionExclusions } from "./MentionExclusions";

export function MentionControls({
  mode,
  phrases,
  patterns,
  previewSource,
  chosenCount,
  status,
  editorKey,
  onDraftChange,
  onModeChange,
  onExclusionsChange,
}: MentionControlsProps) {
  useLocale();
  const { progress, ready, error, pending } = status;
  return (
    <FieldGroup className="gap-6 [container-type:normal]">
      <Field>
        <div className="flex items-center justify-between gap-4">
          <FieldLabel>{t("filter.mentionMode")}</FieldLabel>
          <FieldHelp label={t("filter.mentionHelp")}>
            <FieldDescription>
              {t("text.matchDocumentTitlesNamesAndAliasesAgainstProse")}
            </FieldDescription>
          </FieldHelp>
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          aria-label={t("text.textMentionMode")}
          value={mode}
          className="w-full"
          onValueChange={(value) => {
            if (isMentionMode(value)) onModeChange(value);
          }}
        >
          <ToggleGroupItem value="off" className="flex-1">
            {t("text.off")}
          </ToggleGroupItem>
          <ToggleGroupItem value="selected" className="flex-1">
            {t("text.selectedNodes")}
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="flex-1">
            {t("text.allInScope")}
          </ToggleGroupItem>
        </ToggleGroup>
        {error ? (
          <>
            <FieldDescription>{error}</FieldDescription>
            <Button variant="outline" size="sm" onClick={status.retry}>
              {t("text.retryTextMentions")}
            </Button>
          </>
        ) : mode === "off" ? null : !ready ? (
          <>
            <Progress
              aria-label={t("text.textMentionIndexingProgress")}
              value={progress.total ? (progress.scanned / progress.total) * 100 : 0}
            />
            <FieldDescription>
              {t("mentions.indexing", { read: progress.scanned, total: progress.total })}
            </FieldDescription>
          </>
        ) : (
          <FieldDescription>
            {t("mentions.ready", {
              names: progress.keywords,
              cached: progress.cached,
              updating: pending ? t("text.updatingRelationships") : "",
            })}
          </FieldDescription>
        )}
        {mode === "selected" && !chosenCount && (
          <FieldDescription>
            {t("text.selectNodesToShowRelatedMentionsShiftClick")}
          </FieldDescription>
        )}
      </Field>
      <Separator />
      <MentionExclusions
        key={editorKey}
        phrases={phrases}
        patterns={patterns}
        source={previewSource}
        onApply={onExclusionsChange}
        onDraftChange={onDraftChange}
      />
    </FieldGroup>
  );
}
