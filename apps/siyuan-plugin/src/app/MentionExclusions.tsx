import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  EXCLUDED_PHRASE_LIMIT,
  KEYWORD_LENGTH_LIMIT,
  readExcludedPhrases,
} from "../mentions/keywords";

export function MentionExclusions({
  phrases,
  onApply,
}: {
  phrases: readonly string[];
  onApply: (phrases: string[]) => void;
}) {
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
          aria-label="编辑文本提及排除词组"
        >
          排除词组{phrases.length > 0 && `（${phrases.length}）`}
          <ChevronDown
            data-icon="inline-end"
            className="ml-auto transition-transform group-data-[state=open]:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <Field data-invalid={parsed === null}>
          <FieldLabel htmlFor={id} className="sr-only">
            文本提及排除词组
          </FieldLabel>
          <Textarea
            id={id}
            rows={3}
            className="max-h-48"
            placeholder={"每行一个词组，例如：\n01\n待办"}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-invalid={parsed === null}
            aria-describedby={`${id}-description`}
          />
          <FieldDescription id={`${id}-description`}>
            按完整名称或词组排除，忽略大小写、全半角和多余空格。排除 01 不会排除
            101；节点和块引用仍保留。
          </FieldDescription>
          {parsed === null && (
            <FieldError>
              最多 {EXCLUDED_PHRASE_LIMIT.toLocaleString()} 项，每项不超过 {KEYWORD_LENGTH_LIMIT}{" "}
              个字符，不能包含控制字符。
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
            应用排除
          </Button>
          {changed && <FieldDescription>点击应用后重新计算文本提及。</FieldDescription>}
        </Field>
      </CollapsibleContent>
    </Collapsible>
  );
}
