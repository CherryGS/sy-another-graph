import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { FieldDescription, FieldGroup } from "@/shared/ui/field";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Separator } from "@/shared/ui/separator";
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useLocale } from "../../../shared/i18n/react";
import { t } from "../../../shared/i18n/runtime";
import type { WorkbenchState } from "../../model/state";
import { SettingSwitch } from "../appearance/SettingsPanel";
import { MentionControls } from "../../../modules/mentions/ui/MentionControls";
import { ContentExclusions } from "../../../modules/content-exclusions/ui/ContentExclusions";
import { splitContentExclusions } from "../../../modules/content-exclusions/rules";
import { FilterExplanation } from "./FilterExplanation";
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
  const [page, setPage] = useState(state.contentRules.length ? "exclusions" : "scope");
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
  const pages = [
    {
      value: "scope",
      title: t("filter.scope"),
      summary: scopeName,
      content: <ScopeFilters state={state} />,
    },
    {
      value: "exclusions",
      title: t("contentExclusions.title"),
      summary: state.contentRules.length
        ? t("filter.ruleCount", { count: state.contentRules.length })
        : t("filter.noExclusions"),
      draft: contentDraft,
      content: (
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
      ),
    },
    {
      value: "relationships",
      title: t("filter.relationships"),
      summary: relations.join(t("common.listSeparator")) || t("text.off"),
      content: (
        <FieldGroup className="gap-5 [container-type:normal]">
          <SettingSwitch
            id="reference-filter"
            name={t("text.blockReferencesSolid")}
            checked={filters.references}
            onChange={(references) => setFilters((previous) => ({ ...previous, references }))}
          />
          <Separator />
          <SettingSwitch
            id="hierarchy-filter"
            name={t("text.containmentDashed")}
            checked={filters.hierarchy}
            onChange={(hierarchy) => setFilters((previous) => ({ ...previous, hierarchy }))}
          />
          <Separator />
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
      ),
    },
    {
      value: "mentions",
      title: t("filter.mentions"),
      summary: mentionRules
        ? t("filter.mentionSummary", { mode: mentionMode, count: mentionRules })
        : mentionMode,
      draft: mentionDraft,
      content: (
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
      ),
    },
    {
      value: "display",
      title: t("filter.nodeDisplay"),
      summary: filters.hideIsolated ? t("filter.displaySummary", { types }) : types,
      content: <NodeDisplayFilters state={state} />,
    },
  ];
  return (
    <section className="filter-panel" aria-label={t("text.graphFilters")}>
      <SheetHeader className="gap-3 px-6 py-4 pr-14">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            ref={backRef}
            data-filter-editor-back
            variant="ghost"
            size="icon-sm"
            aria-label={t("text.backToFilterPresets")}
            onClick={onBack}
          >
            <ArrowLeft />
          </Button>
          <SheetTitle className="min-w-0 flex-1 truncate" title={state.filterPresets.activeName}>
            {state.filterPresets.activeName}
          </SheetTitle>
          {state.filterPresets.modified && <Badge variant="secondary">{t("text.modified2")}</Badge>}
        </div>
        <SheetDescription>
          {state.filterPresets.temporaryActive
            ? t("text.theTemporaryScopeIncludesMatchesAndTheirAncestor")
            : t("filter.editorDescription")}
        </SheetDescription>
      </SheetHeader>
      <Tabs value={page} onValueChange={setPage} className="min-h-0 flex-1 gap-0">
        <div className="shrink-0 overflow-x-auto px-6 pb-2">
          <TabsList variant="line" className="w-full min-w-max group-data-horizontal/tabs:h-10">
            {pages.map(({ value, title, summary, draft }) => (
              <TabsTrigger key={value} value={value} title={summary} className="gap-2 px-2">
                {title}
                {draft && <Badge variant="secondary">{t("filter.unapplied")}</Badge>}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <Separator />
        <ScrollArea className="filter-scroll min-h-0" data-scroll-panel>
          {pages.map(({ value, content }) => (
            <TabsContent key={value} value={value} forceMount hidden={page !== value}>
              <div className="p-6">{content}</div>
            </TabsContent>
          ))}
        </ScrollArea>
      </Tabs>
      <Separator />
      <SheetFooter className="gap-3 px-6 py-4">
        {footer}
        <div className="grid grid-cols-2 gap-3">
          <FilterExplanation state={state} />
          <Button variant="ghost" size="sm" className="w-full" onClick={state.resetFilters}>
            <RotateCcw data-icon="inline-start" />
            {t("text.resetFilters")}
          </Button>
        </div>
      </SheetFooter>
    </section>
  );
}
