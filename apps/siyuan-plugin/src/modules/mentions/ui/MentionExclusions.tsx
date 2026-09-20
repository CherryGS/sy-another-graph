import { useLocale } from "../../../shared/i18n/react";
import { t, text } from "../../../shared/i18n/runtime";
import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/shared/ui/field";
import { Textarea } from "@/shared/ui/textarea";
import { FieldHelp } from "@/shared/ui/field-help";
import {
  formatExclusionDraft,
  parseExclusionDraft,
  type MentionExclusions as ExclusionRules,
} from "../exclusions";
import type { MentionControlsProps } from "./types";
import { ExclusionPreview } from "./ExclusionPreview";

export function MentionExclusions({
  phrases,
  patterns,
  source,
  onApply,
  onDraftChange,
}: {
  phrases: readonly string[];
  patterns: readonly string[];
  source: MentionControlsProps["previewSource"];
  onApply: (rules: ExclusionRules) => void;
  onDraftChange?: (changed: boolean) => void;
}) {
  useLocale();
  const id = useId();
  const [draft, setDraft] = useState(() => formatExclusionDraft(phrases, patterns));
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Preset changes and resets replace the editable filter draft.
    setDraft(formatExclusionDraft(phrases, patterns));
  }, [phrases, patterns]);
  const { value: parsed, error } = useMemo(() => parseExclusionDraft(draft), [draft]);
  const changed =
    parsed !== null && JSON.stringify(parsed) !== JSON.stringify({ phrases, patterns });
  useEffect(() => {
    onDraftChange?.(changed || parsed === null);
  }, [changed, parsed, onDraftChange]);
  return (
    <FieldSet className="gap-4">
      <FieldLegend variant="label">{t("filter.mentionExclusions")}</FieldLegend>
      <Field data-invalid={parsed === null}>
        <div className="flex items-start justify-between gap-4">
          <FieldDescription id={`${id}-description`}>
            {t("filter.mentionExclusionHint")}
          </FieldDescription>
          <FieldHelp label={t("contentExclusions.ruleHelp")}>
            <FieldDescription>{t("mentions.exclusionDescription")}</FieldDescription>
          </FieldHelp>
        </div>
        <FieldLabel htmlFor={id} className="sr-only">
          {t("text.excludedMentionPhrases")}
        </FieldLabel>
        <Textarea
          id={id}
          rows={6}
          className="min-h-40 max-h-80"
          placeholder={t("mentions.exclusionPlaceholder")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-invalid={parsed === null}
          aria-describedby={`${id}-description${error ? ` ${id}-error` : ""}`}
        />
        {error && <FieldError id={`${id}-error`}>{text(error)}</FieldError>}
        <ExclusionPreview rules={parsed} source={source} />
        <Button
          variant="outline"
          className="w-full"
          disabled={!changed}
          onClick={() => {
            if (parsed) onApply(parsed);
          }}
        >
          {t("text.applyExclusions")}
        </Button>
        {changed && <FieldDescription>{t("text.applyToRecalculateTextMentions")}</FieldDescription>}
      </Field>
    </FieldSet>
  );
}
