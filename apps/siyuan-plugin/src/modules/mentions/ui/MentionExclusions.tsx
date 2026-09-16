import { useLocale } from "../../../shared/i18n/react";
import { t, text } from "../../../shared/i18n/runtime";
import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/shared/ui/field";
import { Textarea } from "@/shared/ui/textarea";
import {
  formatExclusionDraft,
  parseExclusionDraft,
  type MentionExclusions as ExclusionRules,
} from "../exclusions";

export function MentionExclusions({
  phrases,
  patterns,
  onApply,
}: {
  phrases: readonly string[];
  patterns: readonly string[];
  onApply: (rules: ExclusionRules) => void;
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
  const count = phrases.length + patterns.length;
  return (
    <Collapsible defaultOpen={count > 0}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="group w-full justify-start"
          aria-label={t("text.editExcludedMentionPhrases")}
        >
          {t("text.excludedPhrases")}
          {count > 0 && `（${count}）`}
          <ChevronDown
            data-icon="inline-end"
            className="ml-auto transition-transform group-data-[state=open]:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <Field data-invalid={parsed === null}>
          <FieldLabel htmlFor={id} className="sr-only">
            {t("text.excludedMentionPhrases")}
          </FieldLabel>
          <Textarea
            id={id}
            rows={3}
            className="max-h-48"
            placeholder={t("mentions.exclusionPlaceholder")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-invalid={parsed === null}
            aria-describedby={`${id}-description${error ? ` ${id}-error` : ""}`}
          />
          <FieldDescription id={`${id}-description`}>
            {t("mentions.exclusionDescription")}
          </FieldDescription>
          {error && <FieldError id={`${id}-error`}>{text(error)}</FieldError>}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={!changed}
            onClick={() => {
              if (parsed) onApply(parsed);
            }}
          >
            {t("text.applyExclusions")}
          </Button>
          {changed && (
            <FieldDescription>{t("text.applyToRecalculateTextMentions")}</FieldDescription>
          )}
        </Field>
      </CollapsibleContent>
    </Collapsible>
  );
}
