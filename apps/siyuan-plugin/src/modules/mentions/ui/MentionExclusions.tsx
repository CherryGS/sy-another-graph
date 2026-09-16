import { useLocale } from "../../../shared/i18n/react";
import { t } from "../../../shared/i18n/runtime";
import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/shared/ui/field";
import { Textarea } from "@/shared/ui/textarea";
import { EXCLUDED_PHRASE_LIMIT, KEYWORD_LENGTH_LIMIT, readExcludedPhrases } from "../keywords";

export function MentionExclusions({
  phrases,
  onApply,
}: {
  phrases: readonly string[];
  onApply: (phrases: string[]) => void;
}) {
  useLocale();
  const id = useId();
  const [draft, setDraft] = useState(() => phrases.join("\n"));
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Preset changes and resets replace the editable filter draft.
    setDraft(phrases.join("\n"));
  }, [phrases]);
  const parsed = useMemo(
    () => readExcludedPhrases(draft.split(/\r\n?|\n/u).filter((line) => line.trim())),
    [draft],
  );
  const changed = parsed !== null && JSON.stringify(parsed) !== JSON.stringify(phrases);
  return (
    <Collapsible defaultOpen={phrases.length > 0}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="group w-full justify-start"
          aria-label={t("text.editExcludedMentionPhrases")}
        >
          {t("text.excludedPhrases")}
          {phrases.length > 0 && `（${phrases.length}）`}
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
            placeholder={t("text.onePhrasePerLineForExample01Todo")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-invalid={parsed === null}
            aria-describedby={`${id}-description`}
          />
          <FieldDescription id={`${id}-description`}>
            {t("text.excludeCompleteNamesOrPhrasesIgnoringCaseCharacter")}
          </FieldDescription>
          {parsed === null && (
            <FieldError>
              {t("mentions.exclusionLimit", {
                count: EXCLUDED_PHRASE_LIMIT,
                length: KEYWORD_LENGTH_LIMIT,
              })}
            </FieldError>
          )}
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
