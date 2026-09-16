import { locale } from "../../../shared/i18n/runtime";
import { useLocale } from "../../../shared/i18n/react";
import { t } from "../../../shared/i18n/runtime";
import { useState } from "react";
import { ArrowUpRight, ChevronDown, X } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/ui/empty";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Separator } from "@/shared/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import type { WorkbenchState } from "../../model/state";
import { EDGE_KIND_LABELS, NODE_TYPE_LABELS } from "../../presentation/graph-labels";
import { nodeType } from "../../../core/scope/graph-model";
import { getGraphLookups } from "../../../core/graph/graph-lookups";
import type { GraphNode } from "../../../core/graph/types";
import { NativePreviewButton } from "./NativePreviewButton";

function SourceEntry({
  node,
  id,
  open,
  nativeId,
}: {
  node: GraphNode | undefined;
  id: string;
  open: (id: string) => void;
  nativeId: string | null;
}) {
  useLocale();
  const canOpen = !!nativeId;
  return (
    <NativePreviewButton
      nativeId={nativeId}
      variant="ghost"
      className="h-auto w-full flex-col items-start gap-1.5 py-2"
      disabled={!canOpen}
      onClick={() => open(id)}
      aria-label={
        canOpen
          ? t("text.openOriginalLocationValue", { p0: node?.label ?? id })
          : t("text.noNativeContextAvailable")
      }
    >
      <span className="flex w-full min-w-0 items-center justify-between gap-2">
        <span data-native-preview-anchor className="min-w-0 truncate">
          {node?.label ?? id}
        </span>
        {canOpen && <ArrowUpRight data-icon="inline-end" />}
      </span>
      {node && (
        <span className="w-full whitespace-normal break-words text-left text-xs text-muted-foreground">
          {[
            NODE_TYPE_LABELS[nodeType(node)] ?? nodeType(node),
            node.humanPath || node.documentLabel,
            node.heading,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
      {node?.content && (
        <span className="pointer-events-auto max-h-28 w-full overflow-y-auto whitespace-pre-wrap break-words text-left text-xs text-muted-foreground">
          {node.content}
        </span>
      )}
      <code className="w-full whitespace-normal break-all text-left text-xs text-muted-foreground">
        {id}
      </code>
    </NativePreviewButton>
  );
}

export function EdgeInspector({ state }: { state: WorkbenchState }) {
  useLocale();
  const [limit, setLimit] = useState(15);
  const edge = state.inspectedEdge;
  if (!edge || !state.data) return null;
  const byId = getGraphLookups(state.data).byId;
  const byIndex = state.currentGraph ? getGraphLookups(state.currentGraph).byIndex : undefined;
  const source = byIndex?.get(edge.source);
  const target = byIndex?.get(edge.target);
  const occurrences = edge.provenance ?? [];

  return (
    <aside className="inspector-panel edge-inspector" aria-label={t("text.relationshipEvidence")}>
      <Card className="h-full min-h-0">
        <CardHeader>
          <CardTitle>{EDGE_KIND_LABELS[edge.kind]}</CardTitle>
          <CardAction>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("text.closeRelationshipEvidence")}
                  onClick={state.closeEdge}
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("text.closeRelationshipEvidence")}</TooltipContent>
            </Tooltip>
          </CardAction>
          <CardDescription>
            <span className="break-words">
              {source?.label ?? t("text.unknownEndpoint")} →{" "}
              {target?.label ?? t("text.unknownEndpoint")}
            </span>
          </CardDescription>
        </CardHeader>
        <ScrollArea data-scroll-panel className="min-h-0 flex-1">
          <CardContent className="flex min-w-0 flex-col gap-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {edge.kind === "hierarchy"
                ? t("text.dashedLinksRepresentContainmentNotReferencesInThe")
                : edge.kind === "text-mention"
                  ? t("text.dottedLinksIndicateTextMatchingTheTargetS")
                  : edge.kind === "reference"
                    ? t("text.theseAreTheOriginalReferenceEndpointsRepresentedBy")
                    : t("text.theseRelationshipsComeFromActualDatabaseMembershipsBindings")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {occurrences.length.toLocaleString(locale())} {t("text.evidenceGroups")}
              </Badge>
              <Badge variant="secondary">
                {edge.weight.toLocaleString(locale())} {t("text.records")}
              </Badge>
            </div>
            {!!edge.omittedProvenance && (
              <p className="text-xs text-muted-foreground">
                {t("evidence.omitted", { count: edge.omittedProvenance })}
              </p>
            )}
            {occurrences.slice(0, limit).map((occurrence, index) => (
              <section
                className="flex min-w-0 flex-col gap-2"
                aria-label={occurrence.fieldName || t("text.evidenceValue", { p0: index + 1 })}
                key={`${occurrence.sourceId}:${occurrence.targetId}:${occurrence.fieldId ?? ""}:${index}`}
              >
                {index > 0 && <Separator className="mb-2" />}
                <h3 className="text-sm font-medium">
                  {occurrence.fieldName ||
                    t("text.evidenceValue", { p0: String(index + 1).padStart(2, "0") })}
                </h3>
                <div className="flex min-w-0 flex-col gap-2">
                  {occurrence.mention && (
                    <div className="flex flex-col gap-2">
                      <Badge variant="outline" className="max-w-full">
                        <span className="truncate" title={occurrence.mention.keyword}>
                          {t("text.matchedName")}
                          {occurrence.mention.keyword}
                        </span>
                      </Badge>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {occurrence.mention.excerpt.slice(0, occurrence.mention.start)}
                        <mark className="bg-accent text-accent-foreground">
                          {occurrence.mention.excerpt.slice(
                            occurrence.mention.start,
                            occurrence.mention.end,
                          )}
                        </mark>
                        {occurrence.mention.excerpt.slice(occurrence.mention.end)}
                      </p>
                      {occurrence.mention.candidates > 1 && (
                        <p className="text-xs text-muted-foreground">
                          {t("evidence.ambiguity", { count: occurrence.mention.candidates })}
                        </p>
                      )}
                    </div>
                  )}
                  <SourceEntry
                    node={byId.get(occurrence.sourceId)}
                    id={occurrence.sourceId}
                    open={state.openDocument}
                    nativeId={state.nativeBlockId(occurrence.sourceId)}
                  />
                  <span className="self-center text-xs text-muted-foreground">
                    {occurrence.kind === "hierarchy" ? t("text.contains") : "↓"}
                  </span>
                  {occurrence.viaIds?.map((id) => (
                    <SourceEntry
                      key={id}
                      node={byId.get(id)}
                      id={id}
                      open={state.openDocument}
                      nativeId={state.nativeBlockId(id)}
                    />
                  ))}
                  <SourceEntry
                    node={byId.get(occurrence.targetId)}
                    id={occurrence.targetId}
                    open={state.openDocument}
                    nativeId={state.nativeBlockId(occurrence.targetId)}
                  />
                  {occurrence.weight > 1 && (
                    <Badge variant="outline">
                      {occurrence.weight}{" "}
                      {occurrence.kind === "text-mention"
                        ? t("text.textMatches")
                        : t("text.indexRecords")}
                    </Badge>
                  )}
                  {occurrence.databaseId && (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="group w-full justify-between">
                          {t("text.databaseSource")}
                          <ChevronDown
                            data-icon="inline-end"
                            className="transition-transform group-data-[state=open]:rotate-180"
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="flex flex-col gap-2 px-2 pb-2 text-xs text-muted-foreground">
                          <p className="break-all">
                            {t("text.database2")}
                            {occurrence.databaseId}
                          </p>
                          {occurrence.targetDatabaseId && (
                            <p className="break-all">
                              {t("text.targetDatabase")}
                              {occurrence.targetDatabaseId}
                            </p>
                          )}
                          {occurrence.fieldId && (
                            <p className="break-all">
                              {t("text.field")}
                              {occurrence.fieldId}
                            </p>
                          )}
                          {occurrence.sourceItemId && (
                            <p className="break-all">
                              {t("text.sourceItem2")}
                              {occurrence.sourceItemId}
                            </p>
                          )}
                          {occurrence.targetItemId && (
                            <p className="break-all">
                              {t("text.targetItem2")}
                              {occurrence.targetItemId}
                            </p>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              </section>
            ))}
            {!occurrences.length && (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{t("text.noEvidenceAvailable")}</EmptyTitle>
                  <EmptyDescription>
                    {t("text.thisRelationshipHasNoOriginalLocationsToExpand")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {occurrences.length > limit && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setLimit((value) => value + 15)}
              >
                {t("evidence.showMore", { count: occurrences.length - limit })}
              </Button>
            )}
          </CardContent>
        </ScrollArea>
      </Card>
    </aside>
  );
}
