import { locale } from "../../../shared/i18n/runtime";
import { useLocale } from "../../../shared/i18n/react";
import { t } from "../../../shared/i18n/runtime";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Repeat2 } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/ui/empty";
import type { GraphEdge, GraphNode } from "../../../core/graph/types";
import { getGraphLookups } from "../../../core/graph/graph-lookups";
import { nodeType } from "../../../core/scope/graph-model";
import { EDGE_KIND_LABELS, NODE_TYPE_LABELS } from "../../presentation/graph-labels";
import type { WorkbenchState } from "../../model/state";
import { NativePreviewButton } from "./NativePreviewButton";
import { groupNodeRelations } from "../../model/node-relations";

const PAGE_SIZE = 12;
const GROUPS = [
  {
    key: "outgoing",
    get label() {
      return t("text.outgoingRelationships");
    },
    get description() {
      return t("text.thisNodePointsTo");
    },
    icon: ArrowUpRight,
  },
  {
    key: "incoming",
    get label() {
      return t("text.incomingRelationships");
    },
    get description() {
      return t("text.pointsToThisNode");
    },
    icon: ArrowDownLeft,
  },
  {
    key: "self",
    get label() {
      return t("text.selfRelationships");
    },
    get description() {
      return t("text.thisNodeIsBothTheSourceAndTarget");
    },
    icon: Repeat2,
  },
] as const;

function RelationGroup({
  group,
  edges,
  node,
  state,
}: {
  group: (typeof GROUPS)[number];
  edges: readonly GraphEdge[];
  node: GraphNode;
  state: WorkbenchState;
}) {
  useLocale();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const byIndex = getGraphLookups(state.view).byIndex;
  const Icon = group.icon;
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="group w-full justify-start gap-2">
          <Icon data-icon="inline-start" />
          {group.label}
          <Badge variant="secondary">{edges.length.toLocaleString(locale())}</Badge>
          <ChevronDown
            data-icon="inline-end"
            className="ml-auto transition-transform group-data-[state=open]:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1 pt-1">
          {edges.slice(0, limit).map((edge) => {
            const other = byIndex.get(edge.source === node.index ? edge.target : edge.source);
            const context =
              other &&
              [
                ...new Set([other.documentLabel || other.humanPath, other.heading].filter(Boolean)),
              ].join(" › ");
            return (
              <NativePreviewButton
                key={`${edge.kind}:${edge.source}:${edge.target}`}
                nativeId={other ? state.nativeBlockId(other.id) : null}
                variant="ghost"
                className="h-auto w-full flex-col items-start gap-1.5 py-2.5"
                onClick={() => state.inspectEdge(edge)}
                aria-label={t("text.valueValueValueViewRelationshipDetails", {
                  p0: group.description,
                  p1: other?.label ?? t("text.unknownEndpoint"),
                  p2: EDGE_KIND_LABELS[edge.kind],
                })}
              >
                <span
                  data-native-preview-anchor
                  className="line-clamp-2 w-full whitespace-normal break-words text-left"
                >
                  {other?.label ?? t("text.unknownEndpoint")}
                </span>
                {context && (
                  <span
                    className="w-full truncate text-left text-xs text-muted-foreground"
                    title={other?.humanPath}
                  >
                    {context}
                  </span>
                )}
                <span className="flex w-full flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{EDGE_KIND_LABELS[edge.kind]}</Badge>
                  {edge.ambiguous && (
                    <Badge variant="secondary">{t("text.sameNameCandidate")}</Badge>
                  )}
                  {other && (
                    <span className="text-xs text-muted-foreground">
                      {NODE_TYPE_LABELS[nodeType(other)] ?? nodeType(other)}
                    </span>
                  )}
                  {edge.weight > 1 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {edge.weight.toLocaleString(locale())} {t("text.records")}
                    </span>
                  )}
                </span>
              </NativePreviewButton>
            );
          })}
          {!edges.length && (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">
              {t("relations.emptyGroup", { group: group.label })}
            </p>
          )}
          {edges.length > limit && (
            <Button
              variant="outline"
              size="sm"
              className="mt-1 w-full"
              onClick={() => setLimit((value) => value + PAGE_SIZE)}
            >
              {t("relations.showMore", { group: group.label, count: edges.length - limit })}
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function NodeRelations({ node, state }: { node: GraphNode; state: WorkbenchState }) {
  useLocale();
  const incident = getGraphLookups(state.view).incidentEdges(node.index);
  const groups = useMemo(() => groupNodeRelations(node.index, incident), [node.index, incident]);
  return (
    <section aria-label={t("text.visibleRelationships")} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("text.visibleRelationships")}</h3>
        <Badge variant="outline">{incident.length.toLocaleString(locale())}</Badge>
      </div>
      {incident.length > 0 ? (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("text.hoverToPreviewTheSourceClickForRelationship")}
          </p>
          {GROUPS.filter((group) => group.key !== "self" || groups.self.length).map((group) => (
            <RelationGroup
              key={group.key}
              group={group}
              edges={groups[group.key]}
              node={node}
              state={state}
            />
          ))}
        </>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("text.noVisibleRelationships")}</EmptyTitle>
            <EmptyDescription>{t("text.adjustTheGraphFiltersOrExpansionScope")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}
