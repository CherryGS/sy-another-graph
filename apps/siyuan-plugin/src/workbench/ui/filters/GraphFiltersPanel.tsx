import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  FolderOpen,
  Link2,
  ListFilter,
  Shapes,
  TextSearch,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { FieldDescription, FieldGroup } from "@/shared/ui/field";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Separator } from "@/shared/ui/separator";
import { useLocale } from "../../../shared/i18n/react";
import { t } from "../../../shared/i18n/runtime";
import type { WorkbenchState } from "../../model/state";
import { SettingSwitch } from "../appearance/SettingsPanel";
import { MentionControls } from "../../../modules/mentions/ui/MentionControls";
import { ContentExclusions } from "../../../modules/content-exclusions/ui/ContentExclusions";
import { splitContentExclusions } from "../../../modules/content-exclusions/rules";
import { FilterExplanation } from "./FilterExplanation";
import { FilterSection } from "./FilterSection";
import { ScopeFilters } from "./ScopeFilters";
import { NodeDisplayFilters } from "./NodeDisplayFilters";

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
  const [contentDraft, setContentDraft] = useState(false);
  const [mentionDraft, setMentionDraft] = useState(false);
  useEffect(() => {
    backRef.current?.focus();
  }, []);
  const editorKey =
    (state.filterPresets.temporaryActive
      ? state.filterPresets.temporary?.snapshot.requestId
      : state.filterPresets.activeId) ?? "custom";
  const scopeName = filters.scopeId
    ? state.sourceLookups?.byId.get(filters.scopeId)?.label || filters.scopeId
    : filters.notebook
      ? data?.notebooks.find((book) => book.id === filters.notebook)?.name ||
        t("text.specifiedNotebook")
      : t("text.allNotebooks");
  const relations = [
    filters.references && t("text.references"),
    filters.hierarchy && t("text.containment"),
    filters.databases && t("text.databaseRelationships"),
  ].filter(Boolean);
  const mentionMode =
    filters.mentions === "off"
      ? t("text.off")
      : filters.mentions === "selected"
        ? t("text.selectedNodes")
        : t("text.allInScope");
  const mentionRules =
    filters.excludedMentionPhrases.length + filters.excludedMentionPatterns.length;
  const types = filters.documentsOnly
    ? t("text.documentsOnly")
    : filters.hiddenTypes.length
      ? t("filter.customTypes")
      : t("text.allTypes");
  return (
    <section className="filter-panel" aria-label={t("text.graphFilters")}>
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            ref={backRef}
            variant="ghost"
            size="icon-sm"
            aria-label={t("text.backToFilterPresets")}
            onClick={onBack}
          >
            <ArrowLeft />
          </Button>
          <h2
            className="min-w-0 flex-1 truncate font-medium"
            title={state.filterPresets.activeName}
          >
            {state.filterPresets.activeName}
          </h2>
          {state.filterPresets.modified && <Badge variant="secondary">{t("text.modified2")}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {state.filterPresets.temporaryActive
            ? t("text.theTemporaryScopeIncludesMatchesAndTheirAncestor")
            : t("filter.editorDescription")}
        </p>
      </div>
      <Separator />
      <ScrollArea className="filter-scroll min-h-0" data-scroll-panel>
        <FilterSection title={t("filter.scope")} summary={scopeName} icon={FolderOpen}>
          <ScopeFilters state={state} />
        </FilterSection>
        <Separator />
        <FilterSection
          title={t("contentExclusions.title")}
          summary={
            state.contentRules.length
              ? t("filter.ruleCount", { count: state.contentRules.length })
              : t("filter.noExclusions")
          }
          icon={ListFilter}
          notice={contentDraft ? t("filter.unapplied") : undefined}
        >
          <ContentExclusions
            key={editorKey}
            hideTitle
            data={data}
            rules={state.contentRules}
            status={state.contentExclusions}
            onApply={(rules) =>
              setFilters((previous) => ({ ...previous, ...splitContentExclusions(rules) }))
            }
            onOpen={state.openReadIssueSource}
            onDraftChange={setContentDraft}
          />
        </FilterSection>
        <Separator />
        <FilterSection
          title={t("filter.relationships")}
          summary={relations.join(t("common.listSeparator")) || t("text.off")}
          icon={Link2}
        >
          <FieldGroup className="gap-3 [container-type:normal]">
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
          </FieldGroup>
        </FilterSection>
        <Separator />
        <FilterSection
          title={t("filter.mentions")}
          summary={
            mentionRules
              ? t("filter.mentionSummary", { mode: mentionMode, count: mentionRules })
              : mentionMode
          }
          icon={TextSearch}
          notice={mentionDraft ? t("filter.unapplied") : undefined}
        >
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
            onDraftChange={setMentionDraft}
            onModeChange={(mentions) => setFilters((previous) => ({ ...previous, mentions }))}
            onExclusionsChange={({ phrases, patterns }) =>
              setFilters((previous) => ({
                ...previous,
                excludedMentionPhrases: phrases,
                excludedMentionPatterns: patterns,
              }))
            }
          />
        </FilterSection>
        <Separator />
        <FilterSection
          title={t("filter.nodeDisplay")}
          summary={filters.hideIsolated ? t("filter.displaySummary", { types }) : types}
          icon={Shapes}
        >
          <NodeDisplayFilters state={state} />
        </FilterSection>
      </ScrollArea>
      <Separator />
      <div className="flex flex-col gap-3 p-3">
        {footer}
        <div className="grid grid-cols-2 gap-2">
          <FilterExplanation state={state} />
          <Button variant="ghost" size="sm" className="w-full" onClick={state.resetFilters}>
            <RotateCcw data-icon="inline-start" />
            {t("text.resetFilters")}
          </Button>
        </div>
      </div>
    </section>
  );
}
