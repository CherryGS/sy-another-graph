import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, GripVertical, Trash2 } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../shared/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../../shared/ui/collapsible";
import { Field, FieldError, FieldGroup, FieldLabel } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Textarea } from "../../../shared/ui/textarea";
import { Switch } from "../../../shared/ui/switch";
import { Badge } from "../../../shared/ui/badge";
import { useLocale } from "../../../shared/i18n/react";
import { t, text } from "../../../shared/i18n/runtime";
import type { useSetSorting } from "./use-set-sorting";
import {
  formatSetDraft,
  normalizeSetName,
  parseSetDraft,
  validSetName,
  type LayoutSet,
  type SetRule,
} from "../model";

export function LayoutSetCard({
  set,
  priority,
  matched,
  assigned,
  pending,
  onApply,
  onEnabled,
  onDelete,
  onMove,
  onDraftChange,
  sortHandle,
}: {
  set: LayoutSet;
  priority: number;
  matched?: number;
  assigned?: number;
  pending: boolean;
  onApply: (name: string, rules: SetRule[]) => void;
  onEnabled: (value: boolean) => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onDraftChange: (id: string, changed: boolean) => void;
  sortHandle: ReturnType<typeof useSetSorting>["handle"];
}) {
  useLocale();
  const id = useId();
  const [open, setOpen] = useState(set.rules.length === 0);
  const saved = JSON.stringify({ name: set.name, draft: formatSetDraft(set.rules) });
  const [draft, setDraft] = useState(() => JSON.parse(saved) as { name: string; draft: string });
  useEffect(() => {
    // A priority/toggle change may clone rules; only new saved content replaces a draft.
    // eslint-disable-next-line react/set-state-in-effect -- Restore explicitly applied preset values.
    setDraft(JSON.parse(saved));
  }, [saved]);
  const parsed = useMemo(() => parseSetDraft(draft.draft), [draft.draft]);
  const validName = validSetName(draft.name);
  const changed =
    normalizeSetName(draft.name) !== set.name ||
    !parsed.value ||
    JSON.stringify(parsed.value) !== JSON.stringify(set.rules);
  useEffect(() => {
    onDraftChange(set.id, changed);
    return () => onDraftChange(set.id, false);
  }, [set.id, changed, onDraftChange]);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card size="sm" role="listitem" aria-label={set.name} data-layout-set={set.id}>
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="touch-none cursor-grab active:cursor-grabbing"
              data-set-sort-id={set.id}
              aria-label={t("grouping.reorder", { name: set.name })}
              title={t("grouping.reorderHint")}
              {...sortHandle}
              onKeyDown={(event) => {
                sortHandle.onKeyDown(event);
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  onMove(event.key === "ArrowUp" ? -1 : 1);
                }
              }}
            >
              <GripVertical />
            </Button>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="min-w-0 flex-1 justify-start px-1"
                aria-label={t("grouping.editSet", { name: set.name })}
                title={set.name}
              >
                <span className="truncate">
                  {priority}. {set.name}
                </span>
                <ChevronDown className={open ? "rotate-180" : undefined} data-icon="inline-end" />
              </Button>
            </CollapsibleTrigger>
            <Switch
              checked={set.enabled}
              onCheckedChange={onEnabled}
              aria-label={t("grouping.enableSet", { name: set.name })}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("grouping.deleteSet", { name: set.name })}
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2" aria-live="polite">
            {!set.enabled
              ? t("grouping.disabled")
              : pending
                ? t("grouping.matching")
                : matched === undefined || assigned === undefined
                  ? t("grouping.countsInactive")
                  : t("grouping.memberCounts", { matched, assigned })}
            {changed && <Badge variant="secondary">{t("filter.unapplied")}</Badge>}
          </CardDescription>
        </CardHeader>
        <CollapsibleContent className="flex flex-col gap-3">
          <CardContent>
            <FieldGroup className="gap-3 [container-type:normal]">
              <Field data-invalid={!validName}>
                <FieldLabel htmlFor={`${id}-name`}>{t("grouping.setName")}</FieldLabel>
                <Input
                  id={`${id}-name`}
                  value={draft.name}
                  maxLength={80}
                  aria-invalid={!validName}
                  onChange={(event) =>
                    setDraft((previous) => ({ ...previous, name: event.target.value }))
                  }
                />
                {!validName && <FieldError>{t("grouping.nameError")}</FieldError>}
              </Field>
              <Field data-invalid={!!parsed.error}>
                <FieldLabel htmlFor={`${id}-rules`}>{t("grouping.rules")}</FieldLabel>
                <Textarea
                  id={`${id}-rules`}
                  className="min-h-24 max-h-80"
                  rows={4}
                  aria-invalid={!!parsed.error}
                  value={draft.draft}
                  placeholder={t("grouping.placeholder")}
                  onChange={(event) =>
                    setDraft((previous) => ({ ...previous, draft: event.target.value }))
                  }
                />
                {parsed.error && <FieldError>{text(parsed.error)}</FieldError>}
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              variant="outline"
              disabled={!changed || !validName || !parsed.value}
              onClick={() => {
                if (parsed.value && validName) onApply(normalizeSetName(draft.name), parsed.value);
              }}
            >
              {t("grouping.applySet")}
            </Button>
          </CardFooter>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
