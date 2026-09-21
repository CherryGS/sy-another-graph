import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Boxes,
  FolderOpen,
  Link2,
  ListFilter,
  PanelLeftClose,
  RotateCcw,
  Shapes,
  TextSearch,
  X,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { FieldDescription, FieldGroup } from "@/shared/ui/field";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Separator } from "@/shared/ui/separator";
import {
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { cn } from "@/shared/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { useLocale } from "../../../shared/i18n/react";
import { t } from "../../../shared/i18n/runtime";
import type { WorkbenchState } from "../../model/state";
import { SettingSwitch } from "../appearance/SettingsPanel";
import { MentionControls } from "../../../modules/mentions/ui/MentionControls";
import { MentionRelationImpact } from "../../../modules/mentions/ui/MentionRelationImpact";
import { ContentExclusions } from "../../../modules/content-exclusions/ui/ContentExclusions";
import { splitContentExclusions } from "../../../modules/content-exclusions/rules";
import { FilterExplanation } from "./FilterExplanation";
import { ScopeFilters } from "./ScopeFilters";
import { NodeDisplayFilters } from "./NodeDisplayFilters";
import { GroupingFilters } from "./GroupingFilters";

export function GraphFiltersPanel({
  state,
  collapsed,
  onCollapsedChange,
  onBack,
  footer,
}: {
  state: WorkbenchState;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onBack: () => void;
  footer: ReactNode;
}) {
  useLocale();
  const { filters, setFilters, data } = state;
  const backRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [page, setPage] = useState(
    state.contentRules.length || filters.exclusionPipeline.enabled.empty ? "exclusions" : "scope",
  );
  const activeExclusions = filters.exclusionPipeline.order.filter(
    (kind) =>
      filters.exclusionPipeline.enabled[kind] &&
      (kind === "empty" || state.contentRules.some((rule) => rule.scope === kind)),
  ).length;
  const [contentDraft, setContentDraft] = useState(false);
  const [mentionDraft, setMentionDraft] = useState(false);
  const [groupingDraft, setGroupingDraft] = useState(false);
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
      navLabel: t("filter.scope"),
      icon: FolderOpen,
      summary: scopeName,
      content: <ScopeFilters state={state} />,
    },
    {
      value: "exclusions",
      title: t("contentExclusions.title"),
      navLabel: t("filter.navExclusions"),
      icon: ListFilter,
      summary: activeExclusions
        ? t("contentExclusions.activeSteps", { count: activeExclusions })
        : t("filter.noExclusions"),
      draft: contentDraft,
      content: (
        <ContentExclusions
          key={editorKey}
          data={data}
          rules={state.contentRules}
          context={state.exclusionContext}
          status={state.contentExclusions}
          onPipelineChange={(exclusionPipeline) =>
            setFilters((previous) => ({ ...previous, exclusionPipeline }))
          }
          onApply={(rules) =>
            setFilters((previous) => ({ ...previous, ...splitContentExclusions(rules) }))
          }
          onOpen={state.openReadIssueSource}
          onLocate={(id) => state.setSelectedId(id)}
          canLocate={(id) => !!state.currentGraph?.eligibleIds.has(id)}
          onDraftChange={setContentDraft}
        />
      ),
    },
    {
      value: "relationships",
      title: t("filter.relationships"),
      navLabel: t("filter.relationships"),
      icon: Link2,
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
      navLabel: t("filter.navMentions"),
      icon: TextSearch,
      summary: mentionRules
        ? t("filter.mentionSummary", { mode: mentionMode, count: mentionRules })
        : mentionMode,
      draft: mentionDraft,
      content: (
        <FieldGroup>
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
          <MentionRelationImpact
            data={data}
            graph={state.baseGraph}
            mode={filters.mentions}
            chosenIds={state.chosenIds}
            status={state.mentionState}
            enabled={mentionRules > 0}
            onOpen={state.openReadIssueSource}
          />
        </FieldGroup>
      ),
    },
    {
      value: "grouping",
      title: t("grouping.title"),
      navLabel: t("grouping.title"),
      icon: Boxes,
      summary:
        filters.grouping.mode === "sets"
          ? t("grouping.customSummary", {
              count: filters.grouping.sets.filter((set) => set.enabled).length,
            })
          : t(filters.grouping.mode === "community" ? "grouping.community" : "text.off"),
      draft: groupingDraft,
      content: <GroupingFilters key={editorKey} state={state} onDraftChange={setGroupingDraft} />,
    },
    {
      value: "display",
      title: t("filter.nodeDisplay"),
      navLabel: t("filter.navDisplay"),
      icon: Shapes,
      summary: filters.hideIsolated ? t("filter.displaySummary", { types }) : types,
      content: <NodeDisplayFilters state={state} />,
    },
  ];
  const currentPage = pages.find(({ value }) => value === page)!;
  return (
    <section className="filter-panel" aria-label={t("text.graphFilters")}>
      <SheetTitle className="sr-only">{state.filterPresets.activeName}</SheetTitle>
      <SheetDescription className="sr-only">{t("filter.editorDescription")}</SheetDescription>
      <div className="flex min-h-0 w-11 shrink-0 flex-col items-center gap-2 py-2">
        <Button
          ref={backRef}
          data-filter-editor-back
          variant="ghost"
          size="icon-sm"
          aria-label={t("text.backToFilterPresets")}
          title={t("text.backToFilterPresets")}
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <ScrollArea className="min-h-0 w-full flex-1" data-scroll-panel>
          <ToggleGroup
            type="single"
            orientation="vertical"
            size="sm"
            spacing={1}
            className="w-full px-1"
            value={collapsed ? "" : page}
            aria-label={t("filter.categories")}
            onValueChange={(value) => {
              if (value) setPage(value);
              onCollapsedChange(!value);
            }}
          >
            {pages.map(({ value, title, navLabel, icon: Icon, summary, draft }) => (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    id={id + "-" + value + "-trigger"}
                    value={value}
                    aria-label={title}
                    aria-controls={id + "-" + value}
                    aria-expanded={!collapsed && page === value}
                    className="relative h-auto w-full px-2 py-2"
                  >
                    <span className="flex rotate-180 items-center gap-1.5 [text-orientation:sideways] [writing-mode:vertical-rl]">
                      <Icon className="rotate-90" />
                      <span>{navLabel}</span>
                    </span>
                    {draft && (
                      <Badge className="absolute top-1 right-1 size-1.5 p-0">
                        <span className="sr-only">{t("filter.unapplied")}</span>
                      </Badge>
                    )}
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{title}</p>
                  <p>{summary}</p>
                  {draft && <p>{t("filter.unappliedHint")}</p>}
                </TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
        </ScrollArea>
        <SheetClose asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("filter.close")}
            title={t("filter.close")}
          >
            <X />
          </Button>
        </SheetClose>
      </div>
      {!collapsed && <Separator orientation="vertical" />}
      <div className={cn("min-h-0 min-w-0 flex-1 flex-col", collapsed ? "hidden" : "flex")}>
        <SheetHeader className="gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2
              className="min-w-0 flex-1 truncate font-medium"
              title={state.filterPresets.activeName}
            >
              {state.filterPresets.activeName}
            </h2>
            {state.filterPresets.modified && (
              <Badge variant="secondary">{t("text.modified2")}</Badge>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("filter.collapse")}
              title={t("filter.collapse")}
              onClick={() => {
                onCollapsedChange(true);
                document.getElementById(id + "-" + page + "-trigger")?.focus();
              }}
            >
              <PanelLeftClose />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{currentPage.title}</h3>
            {currentPage.draft && <Badge variant="secondary">{t("filter.unapplied")}</Badge>}
          </div>
        </SheetHeader>
        <Separator />
        {pages.map(({ value, title, content }) => (
          <section
            key={value}
            id={id + "-" + value}
            aria-label={title}
            className={cn("min-h-0 flex-1 flex-col", page === value ? "flex" : "hidden")}
          >
            <ScrollArea className="filter-scroll min-h-0" data-scroll-panel>
              <div className="p-4">{content}</div>
            </ScrollArea>
          </section>
        ))}
        <Separator />
        <SheetFooter className="max-h-[40%] gap-3 overflow-y-auto p-3" data-scroll-panel>
          {footer}
          <div className="grid grid-cols-2 gap-2">
            <FilterExplanation state={state} compact />
            <Button variant="ghost" size="sm" className="w-full" onClick={state.resetFilters}>
              <RotateCcw data-icon="inline-start" />
              {t("text.resetFilters")}
            </Button>
          </div>
        </SheetFooter>
      </div>
    </section>
  );
}
