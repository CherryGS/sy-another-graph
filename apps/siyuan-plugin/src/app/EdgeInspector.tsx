import { useState } from "react";
import { ArrowUpRight, ChevronDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { WorkbenchState } from "./state";
import { EDGE_KIND_LABELS, NODE_TYPE_LABELS } from "../data/labels";
import { nodeType } from "../data/graph-model";
import { getGraphLookups } from "../data/graph-lookups";
import type { GraphNode } from "../data/types";
import { NativePreviewButton } from "./NativePreviewButton";

function SourceCard({
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
  const canOpen = !!nativeId;
  return (
    <NativePreviewButton
      nativeId={nativeId}
      variant="outline"
      className="h-auto w-full flex-col items-start gap-2 py-3"
      disabled={!canOpen}
      onClick={() => open(id)}
      aria-label={canOpen ? `打开原始位置：${node?.label ?? id}` : "暂无可打开的原生上下文"}
    >
      <span className="flex w-full min-w-0 items-center justify-between gap-2">
        <span data-native-preview-anchor className="min-w-0 truncate">{node?.label ?? id}</span>
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
  const [limit, setLimit] = useState(15);
  const edge = state.inspectedEdge;
  if (!edge || !state.data) return null;
  const byId = getGraphLookups(state.data).byId;
  const byIndex = state.currentGraph
    ? getGraphLookups(state.currentGraph).byIndex
    : undefined;
  const source = byIndex?.get(edge.source);
  const target = byIndex?.get(edge.target);
  const occurrences = edge.provenance ?? [];

  return (
    <aside className="inspector-panel edge-inspector" aria-label="关系出处">
      <Card className="h-full min-h-0">
        <CardHeader>
          <CardTitle>{EDGE_KIND_LABELS[edge.kind]}</CardTitle>
          <CardAction>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="关闭关系出处"
                  onClick={state.closeEdge}
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent>关闭关系出处</TooltipContent>
            </Tooltip>
          </CardAction>
          <CardDescription>
            <span className="break-words">
              {source?.label ?? "未知端点"} → {target?.label ?? "未知端点"}
            </span>
          </CardDescription>
        </CardHeader>
        <ScrollArea data-scroll-panel className="min-h-0 flex-1">
          <CardContent className="flex min-w-0 flex-col gap-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {edge.kind === "hierarchy"
                ? "虚线表示内容包含，不是正文引用。"
                : edge.kind === "text-mention"
                  ? "点线表示正文命中了目标名称，是可能的文本提及；可结合原始段落判断。"
                : edge.kind === "reference"
                  ? "以下是这条连线对应的原始引用端点。"
                  : "以下关系来自数据库的真实成员、绑定或关系字段。"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {occurrences.length.toLocaleString()} 组出处
              </Badge>
              <Badge variant="secondary">
                {edge.weight.toLocaleString()} 条记录
              </Badge>
            </div>
            {!!edge.omittedProvenance && <p className="text-xs text-muted-foreground">另有 {edge.omittedProvenance.toLocaleString()} 组出处超出展示上限；计数包含这些命中。</p>}
            {occurrences.slice(0, limit).map((occurrence, index) => (
              <Card
                size="sm"
                key={`${occurrence.sourceId}:${occurrence.targetId}:${occurrence.fieldId ?? ""}:${index}`}
              >
                <CardHeader>
                  <CardTitle>
                    {occurrence.fieldName ||
                      `出处 ${String(index + 1).padStart(2, "0")}`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex min-w-0 flex-col gap-2">
                  {occurrence.mention && (
                    <div className="flex flex-col gap-2">
                      <Badge variant="outline" className="max-w-full"><span className="truncate" title={occurrence.mention.keyword}>命中名称：{occurrence.mention.keyword}</span></Badge>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {occurrence.mention.excerpt.slice(0, occurrence.mention.start)}
                        <mark className="bg-accent text-accent-foreground">{occurrence.mention.excerpt.slice(occurrence.mention.start, occurrence.mention.end)}</mark>
                        {occurrence.mention.excerpt.slice(occurrence.mention.end)}
                      </p>
                      {occurrence.mention.candidates > 1 && <p className="text-xs text-muted-foreground">此名称对应范围内 {occurrence.mention.candidates} 个原始位置；当前目标为同名候选之一。</p>}
                    </div>
                  )}
                  <SourceCard
                    node={byId.get(occurrence.sourceId)}
                    id={occurrence.sourceId}
                    open={state.openDocument}
                    nativeId={state.nativeBlockId(occurrence.sourceId)}
                  />
                  <span className="self-center text-xs text-muted-foreground">
                    {occurrence.kind === "hierarchy" ? "包含 ↓" : "↓"}
                  </span>
                  {occurrence.viaIds?.map((id) => (
                    <SourceCard
                      key={id}
                      node={byId.get(id)}
                      id={id}
                      open={state.openDocument}
                      nativeId={state.nativeBlockId(id)}
                    />
                  ))}
                  <SourceCard
                    node={byId.get(occurrence.targetId)}
                    id={occurrence.targetId}
                    open={state.openDocument}
                    nativeId={state.nativeBlockId(occurrence.targetId)}
                  />
                  {occurrence.weight > 1 && (
                    <Badge variant="outline">
                      {occurrence.weight} {occurrence.kind === "text-mention" ? "处文本命中" : "条索引记录"}
                    </Badge>
                  )}
                  {occurrence.databaseId && (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          className="group w-full justify-between"
                        >
                          数据库来源
                          <ChevronDown
                            data-icon="inline-end"
                            className="transition-transform group-data-[state=open]:rotate-180"
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="flex flex-col gap-2 px-2 pb-2 text-xs text-muted-foreground">
                          <p className="break-all">
                            数据库：{occurrence.databaseId}
                          </p>
                          {occurrence.targetDatabaseId && (
                            <p className="break-all">
                              目标数据库：{occurrence.targetDatabaseId}
                            </p>
                          )}
                          {occurrence.fieldId && (
                            <p className="break-all">
                              字段：{occurrence.fieldId}
                            </p>
                          )}
                          {occurrence.sourceItemId && (
                            <p className="break-all">
                              来源条目：{occurrence.sourceItemId}
                            </p>
                          )}
                          {occurrence.targetItemId && (
                            <p className="break-all">
                              目标条目：{occurrence.targetItemId}
                            </p>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </CardContent>
              </Card>
            ))}
            {!occurrences.length && (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>暂无可用出处</EmptyTitle>
                  <EmptyDescription>
                    这条关系没有附带可展开的原始位置。
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
                显示更多出处（剩余 {occurrences.length - limit}）
              </Button>
            )}
          </CardContent>
        </ScrollArea>
      </Card>
    </aside>
  );
}
