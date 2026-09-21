import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Separator } from "@/shared/ui/separator";
import { FieldHelp } from "@/shared/ui/field-help";
import { t } from "../../../shared/i18n/runtime";
import { useLocale } from "../../../shared/i18n/react";
import {
  GROUPING_RANGES,
  SET_LIMIT,
  SET_RULE_LIMIT,
  SET_PATTERN_LIMIT,
  readGrouping,
  reorderSets,
  type LayoutGrouping,
} from "../../../modules/layout-groups/model";
import { LayoutSetCard } from "../../../modules/layout-groups/ui/LayoutSetCard";
import { useSetSorting } from "../../../modules/layout-groups/ui/use-set-sorting";
import type { WorkbenchState } from "../../model/state";
import { SettingSlider, SettingSwitch } from "../appearance/SettingsPanel";

export function GroupingFilters({
  state,
  onDraftChange,
}: {
  state: WorkbenchState;
  onDraftChange: (changed: boolean) => void;
}) {
  useLocale();
  const value = state.filters.grouping;
  const status = state.layoutGrouping;
  const [invalid, setInvalid] = useState(false);
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  const setDirtyId = useCallback(
    (id: string, changed: boolean) =>
      setDirty((previous) => {
        if (previous.has(id) === changed) return previous;
        const next = new Set(previous);
        if (changed) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );
  const hasDraft = value.sets.some((set) => dirty.has(set.id));
  useEffect(() => onDraftChange(hasDraft), [hasDraft, onDraftChange]);
  const change = (next: LayoutGrouping) => {
    const parsed = readGrouping(next);
    setInvalid(!parsed);
    if (parsed) state.setFilters((previous) => ({ ...previous, grouping: parsed }));
  };
  const reorder = (id: string, destination: number) =>
    change({ ...value, sets: reorderSets(value.sets, id, destination) });
  const { listRef, drop, handle } = useSetSorting(reorder);
  return (
    <FieldGroup className="gap-4 [container-type:normal]">
      <Field>
        <FieldLabel id="grouping-mode-label">{t("grouping.mode")}</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          className="w-full"
          aria-labelledby="grouping-mode-label"
          value={value.mode}
          onValueChange={(mode) => {
            if (mode === "off" || mode === "community" || mode === "sets")
              change({ ...value, mode });
          }}
        >
          <ToggleGroupItem value="off" className="flex-1">
            {t("text.off")}
          </ToggleGroupItem>
          <ToggleGroupItem value="community" className="flex-1">
            {t("grouping.community")}
          </ToggleGroupItem>
          <ToggleGroupItem value="sets" className="flex-1">
            {t("grouping.sets")}
          </ToggleGroupItem>
        </ToggleGroup>
        <FieldDescription>{t("grouping.description")}</FieldDescription>
      </Field>
      {value.mode !== "off" && state.graphSettings.layoutMode === "layered" && (
        <Alert>
          <AlertDescription className="flex flex-col gap-2">
            {t("grouping.layeredHint")}
            <Button
              variant="outline"
              size="sm"
              onClick={() => state.setGraphSettings({ layoutMode: "force" })}
            >
              {t("grouping.switchForce")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {value.mode !== "off" && (
        <>
          <SettingSlider
            name={t("grouping.strength")}
            value={value.strength}
            range={GROUPING_RANGES.strength}
            onCommit={(strength) => change({ ...value, strength })}
            description={t("text.higherValuesBringGroupsCloserSetTo0")}
          />
          <SettingSwitch
            id="grouping-background"
            name={t("grouping.background")}
            checked={value.background}
            disabled={state.graphSettings.dimensions === 3}
            onChange={(background) => change({ ...value, background })}
          />
          <Separator />
        </>
      )}
      {value.mode === "community" && (
        <SettingSlider
          name={t("text.communityResolution")}
          value={value.resolution}
          range={GROUPING_RANGES.resolution}
          onCommit={(resolution) => change({ ...value, resolution })}
          description={t("text.higherValuesUsuallyProduceFinerGroupsChangesRecalculate")}
        />
      )}
      {value.mode !== "off" && (
        <FieldDescription role="status">
          {status.presentation.pending
            ? t(value.mode === "sets" ? "grouping.matching" : "text.calculatingCommunities")
            : status.presentation.error
              ? t("grouping.failed")
              : t("grouping.available", { count: status.presentation.partition?.count ?? 0 })}
        </FieldDescription>
      )}
      {status.presentation.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {status.presentation.error}
            {value.mode === "sets" && (
              <Button variant="outline" size="sm" onClick={status.retry}>
                {t("grouping.retry")}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className={value.mode === "sets" ? "flex flex-col gap-4" : "hidden"}>
        <div className="flex items-start justify-between gap-3">
          <FieldDescription>{t("grouping.priorityHint")}</FieldDescription>
          <FieldHelp label={t("grouping.ruleHelp")}>
            <FieldDescription>{t("grouping.syntax")}</FieldDescription>
            <FieldDescription>{t("grouping.independent")}</FieldDescription>
            <FieldDescription>{t("grouping.reorderHint")}</FieldDescription>
          </FieldHelp>
        </div>
        <Button
          variant="outline"
          className="w-full"
          disabled={value.sets.length >= SET_LIMIT}
          onClick={() =>
            change({
              ...value,
              sets: [
                ...value.sets,
                {
                  id: crypto.randomUUID(),
                  name: t("grouping.newSet", { number: value.sets.length + 1 }),
                  enabled: true,
                  rules: [],
                },
              ],
            })
          }
        >
          <Plus data-icon="inline-start" />
          {t("grouping.addSet")}
        </Button>
        {invalid && (
          <FieldError>
            {t("grouping.ruleLimit", { rules: SET_RULE_LIMIT, patterns: SET_PATTERN_LIMIT })}
          </FieldError>
        )}
        {!value.sets.length && <FieldDescription>{t("grouping.empty")}</FieldDescription>}
        <div
          ref={listRef}
          role="list"
          aria-label={t("grouping.setList")}
          className="flex flex-col gap-3"
        >
          {value.sets.map((set, index) => (
            <div key={set.id} className="relative">
              {drop?.id === set.id && !drop.after && <Separator className="absolute -top-1.5" />}
              <LayoutSetCard
                set={set}
                priority={index + 1}
                matched={status.sets?.matches[index]}
                assigned={status.sets?.sizes[index]}
                pending={status.presentation.pending}
                onDraftChange={setDirtyId}
                onApply={(name, rules) =>
                  change({
                    ...value,
                    sets: value.sets.map((item) =>
                      item.id === set.id ? { ...item, name, rules } : item,
                    ),
                  })
                }
                onEnabled={(enabled) =>
                  change({
                    ...value,
                    sets: value.sets.map((item) =>
                      item.id === set.id ? { ...item, enabled } : item,
                    ),
                  })
                }
                onDelete={() =>
                  change({ ...value, sets: value.sets.filter((item) => item.id !== set.id) })
                }
                onMove={(direction) => reorder(set.id, index + direction)}
                sortHandle={handle}
              />
              {drop?.id === set.id && drop.after && <Separator className="absolute -bottom-1.5" />}
            </div>
          ))}
        </div>
      </div>
    </FieldGroup>
  );
}
