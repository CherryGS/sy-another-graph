import { useLocale } from "../../../shared/i18n/react";
import { t } from "../../../shared/i18n/runtime";
import { presentNode } from "../../presentation/present-nodes";
import { useId, useState } from "react";
import { ArrowUpRight, ChevronDown, GitBranch, X } from "lucide-react";
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
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Separator } from "@/shared/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import type { WorkbenchState } from "../../model/state";
import { nodeColor } from "../../presentation/node-colors";
import { nodeType } from "../../../core/scope/graph-model";
import { NODE_TYPE_LABELS } from "../../presentation/graph-labels";
import { NodeRelations } from "./NodeRelations";
import { NativePreviewButton } from "./NativePreviewButton";
import { SearchOriginBadge } from "./SearchOriginBadge";
import { searchOriginDescription } from "../../presentation/search-origins";
import { UNREACHABLE } from "../../../modules/layout/layers";

export function NodeInspector({ state }: { state: WorkbenchState }) {
  useLocale();
  const [target, setTarget] = useState("");
  const targetId = useId();
  const node = state.selected;
  if (!node) return null;
  const layer = state.layeredLayout.layers?.distanceById.get(node.id);
  const nativeId = state.nativeBlockId(node.id);
  const notebook = state.data?.notebooks.find((book) => book.id === node.notebook);

  return (
    <aside className="inspector-panel" aria-label={t("text.nodeDetails")}>
      <Card className="h-full min-h-0">
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{
                background: nodeColor(
                  presentNode(node, state.currentGraph, state.data?.notebooks ?? []),
                  state.colorBy,
                ),
              }}
            />
            {nativeId ? (
              <NativePreviewButton
                nativeId={nativeId}
                variant="ghost"
                className="h-auto min-w-0 flex-1 justify-start px-1 py-0.5"
                aria-label={t("text.openNodeSourceValue", { p0: node.label })}
                onClick={() => state.openDocument(node.id)}
              >
                <span data-native-preview-anchor className="min-w-0 truncate">
                  {node.label}
                </span>
                <ArrowUpRight data-icon="inline-end" />
              </NativePreviewButton>
            ) : (
              <span className="min-w-0 truncate" title={node.label}>
                {node.label}
              </span>
            )}
          </CardTitle>
          <CardAction>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("text.closeNodeDetails")}
                  onClick={state.closeInspector}
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("text.closeNodeDetails")}</TooltipContent>
            </Tooltip>
          </CardAction>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{NODE_TYPE_LABELS[nodeType(node)] ?? nodeType(node)}</Badge>
            <SearchOriginBadge id={node.id} origins={state.searchOrigins} />
            {layer !== undefined && (
              <Badge variant="outline">
                {layer === UNREACHABLE
                  ? t("layout.unreachable")
                  : t("layout.hop", { count: layer })}
              </Badge>
            )}
            {node.notebook && (
              <span className="break-words">{notebook?.name ?? node.notebook}</span>
            )}
          </CardDescription>
        </CardHeader>
        <ScrollArea data-scroll-panel className="min-h-0 flex-1">
          <CardContent className="flex min-w-0 flex-col gap-4">
            {state.searchOrigins && (
              <p className="text-xs text-muted-foreground">
                {searchOriginDescription(node.id, state.searchOrigins)}
              </p>
            )}
            {(node.humanPath || node.documentLabel) && (
              <p className="break-words text-xs leading-relaxed text-muted-foreground">
                {node.humanPath || node.documentLabel}
                {node.heading && ` › ${node.heading}`}
              </p>
            )}
            {node.content &&
              (node.blockType !== "d" || node.content.trim() !== node.label.trim()) && (
                <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {node.content}
                </p>
              )}
            <p className="text-xs text-muted-foreground">
              {nativeId
                ? t("text.hoverOverTheTitleToPreviewTheSource")
                : t("text.thisNodeHasNoNativeContextAvailableFor")}
            </p>
            <Separator />
            <NodeRelations node={node} state={state} />
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="group w-full justify-between">
                  {t("text.nodeInformation")}
                  <ChevronDown
                    data-icon="inline-end"
                    className="transition-transform group-data-[state=open]:rotate-180"
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-col gap-2 px-2 pb-2 text-xs text-muted-foreground">
                  <code className="break-all">{node.id}</code>
                  {node.path && <p className="break-all">{node.path}</p>}
                  {node.databaseId && (
                    <p className="break-all">
                      {t("text.database2")}
                      {node.databaseId}
                    </p>
                  )}
                  {node.itemId && (
                    <p className="break-all">
                      {t("text.item")}
                      {node.itemId}
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="group w-full justify-between">
                  {t("text.pathFinder")}
                  <ChevronDown
                    data-icon="inline-end"
                    className="transition-transform group-data-[state=open]:rotate-180"
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <form
                  className="px-2 pb-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!state.busy && target) void state.findPath(target);
                  }}
                >
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor={targetId}>{t("text.targetTitleOrId")}</FieldLabel>
                      <Input
                        id={targetId}
                        aria-label={t("text.pathTargetNode")}
                        value={target}
                        onChange={(event) => setTarget(event.target.value)}
                      />
                    </Field>
                    <Button
                      variant="outline"
                      type="submit"
                      className="w-full"
                      disabled={state.busy || !target}
                    >
                      <GitBranch data-icon="inline-start" />
                      {t("text.findPath")}
                    </Button>
                  </FieldGroup>
                </form>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </ScrollArea>
      </Card>
    </aside>
  );
}
