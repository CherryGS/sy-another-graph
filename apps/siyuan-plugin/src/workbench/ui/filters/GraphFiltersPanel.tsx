import { locale } from "../../../shared/i18n/runtime";
import { useLocale } from "../../../shared/i18n/react";
import { t } from "../../../shared/i18n/runtime";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Checkbox } from "@/shared/ui/checkbox";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Separator } from "@/shared/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import type { WorkbenchState } from "../../model/state";
import { getNodeTypeCounts } from "../../../core/graph/graph-summary";
import { isTypeHidden } from "../../../core/scope/filter-types";
import { NODE_TYPE_LABELS } from "../../presentation/graph-labels";
import { SettingSwitch } from "../appearance/SettingsPanel";
import { MentionControls } from "../../../modules/mentions/ui/MentionControls";
import { FilterExplanation } from "./FilterExplanation";
import { ContentExclusions } from "../../../modules/content-exclusions/ui/ContentExclusions";
import { splitContentExclusions } from "../../../modules/content-exclusions/rules";

const NATIVE_ID = /^\d{14}-[a-z0-9]{7}$/;

export function GraphFiltersPanel({
  state,
  onBack,
  footer,
}: {
  state: WorkbenchState;
  onBack: () => void;
  footer: ReactNode;
}) {
  useLocale();
  const { filters, setFilters, data } = state;
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backRef.current?.focus();
  }, []);
  const [scopeDraft, setScopeDraft] = useState(filters.scopeId);
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Reflect native scope and filter-preset changes.
    setScopeDraft(filters.scopeId);
  }, [filters.scopeId]);
  const types = useMemo(() => {
    if (!data) return [];
    return [...getNodeTypeCounts(data.nodes)].sort(([a], [b]) =>
      a === "d" ? -1 : b === "d" ? 1 : a.localeCompare(b),
    );
  }, [data]);
  const scopeValid = !scopeDraft || NATIVE_ID.test(scopeDraft);
  const editorKey =
    (state.filterPresets.temporaryActive
      ? state.filterPresets.temporary?.snapshot.requestId
      : state.filterPresets.activeId) ?? "custom";
  return (
    <section className="filter-panel" aria-label={t("text.graphFilters")}>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            ref={backRef}
            variant="ghost"
            size="icon-sm"
            aria-label={t("text.backToFilterPresets")}
            onClick={onBack}
          >
            <ArrowLeft />
          </Button>
          <h2 className="min-w-0 truncate font-medium" title={state.filterPresets.activeName}>
            {t("preset.edit", { name: state.filterPresets.activeName })}
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {state.filterPresets.temporaryActive
            ? t("text.theTemporaryScopeIncludesMatchesAndTheirAncestor")
            : t("text.filtersApplyAutomaticallyApplyExcludedPhrasesWithThe")}
        </p>
      </div>
      <ScrollArea className="filter-scroll min-h-0" data-scroll-panel>
        <div className="px-4 pb-4">
          <FieldGroup>
            <Field data-invalid={!scopeValid}>
              <FieldLabel htmlFor="graph-scope">
                {t("text.initialScopeDocumentOrBlockId")}
              </FieldLabel>
              <Input
                id="graph-scope"
                placeholder={t("text.leaveEmptyToViewEverything")}
                value={scopeDraft}
                aria-invalid={!scopeValid}
                onChange={(event) => {
                  const scopeId = event.target.value.trim();
                  setScopeDraft(scopeId);
                  if (!scopeId || NATIVE_ID.test(scopeId))
                    setFilters((previous) => ({ ...previous, scopeId }));
                }}
              />
              <FieldDescription>
                {t("text.traversalStaysWithinTheInitialScopeNodesOutside")}
              </FieldDescription>
              {!scopeValid && (
                <FieldError>{t("text.enterACompleteBlockIdThePreviousScope")}</FieldError>
              )}
            </Field>
            <SettingSwitch
              id="include-children"
              name={t("text.includeChildDocuments")}
              checked={filters.includeChildDocuments}
              onChange={(includeChildDocuments) =>
                setFilters((previous) => ({
                  ...previous,
                  includeChildDocuments,
                }))
              }
            />
            <ContentExclusions
              key={editorKey}
              data={data}
              rules={state.contentRules}
              status={state.contentExclusions}
              onApply={(rules) =>
                setFilters((previous) => ({ ...previous, ...splitContentExclusions(rules) }))
              }
              onOpen={state.openReadIssueSource}
            />
            <Field>
              <FieldLabel htmlFor="notebook-filter">{t("text.notebook")}</FieldLabel>
              <Select
                value={filters.notebook || "all"}
                onValueChange={(value) =>
                  setFilters((previous) => ({
                    ...previous,
                    notebook: value === "all" ? "" : value,
                  }))
                }
              >
                <SelectTrigger id="notebook-filter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">{t("text.allNotebooks")}</SelectItem>
                    {data?.notebooks.map((book) => (
                      <SelectItem key={book.id} value={book.id}>
                        {book.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <FieldSet>
              <FieldLegend>{t("filter.relationships")}</FieldLegend>
              <FieldGroup>
                <SettingSwitch
                  id="reference-filter"
                  name={t("text.blockReferencesSolid")}
                  checked={filters.references}
                  onChange={(references) => setFilters((previous) => ({ ...previous, references }))}
                />
                <SettingSwitch
                  id="hierarchy-filter"
                  name={t("text.containmentDashed")}
                  checked={filters.hierarchy}
                  onChange={(hierarchy) => setFilters((previous) => ({ ...previous, hierarchy }))}
                />
                <SettingSwitch
                  id="database-filter"
                  name={t("text.databaseRelationships")}
                  checked={filters.databases}
                  onChange={(databases) => setFilters((previous) => ({ ...previous, databases }))}
                />
                <FieldDescription>
                  {t("text.eachEnabledRelationshipCostsOneHopDisabledRelationships")}
                </FieldDescription>
                <MentionControls
                  mode={filters.mentions}
                  phrases={filters.excludedMentionPhrases}
                  patterns={filters.excludedMentionPatterns}
                  previewSource={{
                    blocks: data?.mentionBlocks,
                    nodes: state.sourceLookups?.byId,
                    open: state.openReadIssueSource,
                  }}
                  chosenCount={state.chosenIds.length}
                  status={state.mentionState}
                  editorKey={editorKey}
                  onModeChange={(mentions) => setFilters((previous) => ({ ...previous, mentions }))}
                  onExclusionsChange={({ phrases, patterns }) =>
                    setFilters((previous) => ({
                      ...previous,
                      excludedMentionPhrases: phrases,
                      excludedMentionPatterns: patterns,
                    }))
                  }
                />
                <SettingSwitch
                  id="isolated-filter"
                  name={t("text.hideUnselectedIsolatedNodes")}
                  checked={filters.hideIsolated}
                  onChange={(hideIsolated) =>
                    setFilters((previous) => ({ ...previous, hideIsolated }))
                  }
                />
              </FieldGroup>
            </FieldSet>
            <FieldSet>
              <FieldLegend>{t("text.nodeTypes")}</FieldLegend>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFilters((previous) => ({
                      ...previous,
                      documentsOnly: false,
                      hiddenTypes: [],
                    }))
                  }
                >
                  {t("text.allTypes")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFilters((previous) => ({
                      ...previous,
                      documentsOnly: true,
                      hiddenTypes: [],
                    }))
                  }
                >
                  {t("text.documentsOnly")}
                </Button>
              </div>
              <FieldGroup className="gap-3">
                {types.map(([type, count]) => (
                  <Field key={type} orientation="horizontal" data-disabled={type === "d"}>
                    <Checkbox
                      id={`type-${type}`}
                      aria-label={t("text.showValue", { p0: NODE_TYPE_LABELS[type] ?? type })}
                      disabled={type === "d"}
                      checked={!isTypeHidden(filters, type)}
                      onCheckedChange={(checked) =>
                        setFilters((previous) => {
                          const hiddenTypes = previous.documentsOnly
                            ? types
                                .map(([nodeType]) => nodeType)
                                .filter((nodeType) => nodeType !== "d")
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
                    <FieldLabel htmlFor={`type-${type}`}>
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
          </FieldGroup>
        </div>
      </ScrollArea>
      <Separator />
      <div className="flex flex-col gap-2 p-3">
        <FilterExplanation state={state} />
        {footer}
        <Button variant="outline" className="w-full" onClick={state.resetFilters}>
          {t("text.resetFilters")}
        </Button>
      </div>
    </section>
  );
}
