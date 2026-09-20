import { useMemo } from "react";
import { Badge } from "@/shared/ui/badge";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/shared/ui/field";
import { Separator } from "@/shared/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { locale, t } from "../../../shared/i18n/runtime";
import { getNodeTypeCounts } from "../../../core/graph/graph-summary";
import { isTypeHidden } from "../../../core/scope/filter-types";
import type { WorkbenchState } from "../../model/state";
import { NODE_TYPE_LABELS } from "../../presentation/graph-labels";
import { SettingSwitch } from "../appearance/SettingsPanel";

export function NodeDisplayFilters({ state }: { state: WorkbenchState }) {
  const { data, filters, setFilters } = state;
  const types = useMemo(
    () =>
      data
        ? [...getNodeTypeCounts(data.nodes)].sort(([a], [b]) =>
            a === "d" ? -1 : b === "d" ? 1 : a.localeCompare(b),
          )
        : [],
    [data],
  );
  return (
    <FieldGroup className="gap-4 [container-type:normal]">
      <FieldSet className="gap-3">
        <FieldLegend variant="label">{t("text.nodeTypes")}</FieldLegend>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full"
          aria-label={t("text.nodeTypes")}
          value={filters.documentsOnly ? "documents" : filters.hiddenTypes.length ? "" : "all"}
          onValueChange={(value) => {
            if (value === "documents" || value === "all")
              setFilters((previous) => ({
                ...previous,
                documentsOnly: value === "documents",
                hiddenTypes: [],
              }));
          }}
        >
          <ToggleGroupItem value="documents" className="flex-1">
            {t("text.documentsOnly")}
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="flex-1">
            {t("text.allTypes")}
          </ToggleGroupItem>
        </ToggleGroup>
        <FieldGroup className="grid grid-cols-1 gap-3 [container-type:normal] min-[360px]:grid-cols-2">
          {types.map(([type, count]) => (
            <Field
              key={type}
              orientation="horizontal"
              data-disabled={type === "d"}
              className="min-w-0 gap-2"
            >
              <Checkbox
                id={`type-${type}`}
                aria-label={t("text.showValue", { p0: NODE_TYPE_LABELS[type] ?? type })}
                disabled={type === "d"}
                checked={!isTypeHidden(filters, type)}
                onCheckedChange={(checked) =>
                  setFilters((previous) => {
                    const hiddenTypes = previous.documentsOnly
                      ? types.map(([nodeType]) => nodeType).filter((nodeType) => nodeType !== "d")
                      : previous.hiddenTypes;
                    return {
                      ...previous,
                      documentsOnly: false,
                      hiddenTypes:
                        checked === true
                          ? hiddenTypes.filter((hidden) => hidden !== type)
                          : [...new Set([...hiddenTypes, type])],
                    };
                  })
                }
              />
              <FieldLabel
                htmlFor={`type-${type}`}
                className="min-w-0 truncate"
                title={NODE_TYPE_LABELS[type] ?? type}
              >
                {NODE_TYPE_LABELS[type] ?? type}
              </FieldLabel>
              <Badge variant="secondary">{count.toLocaleString(locale())}</Badge>
            </Field>
          ))}
        </FieldGroup>
        <FieldDescription>
          {t("text.referencesFromHiddenBlocksBelongToTheirDocument")}
        </FieldDescription>
      </FieldSet>
      <Separator />
      <SettingSwitch
        id="isolated-filter"
        name={t("text.hideUnselectedIsolatedNodes")}
        checked={filters.hideIsolated}
        onChange={(hideIsolated) => setFilters((previous) => ({ ...previous, hideIsolated }))}
      />
      <FieldDescription>{t("filter.isolatedDescription")}</FieldDescription>
    </FieldGroup>
  );
}
