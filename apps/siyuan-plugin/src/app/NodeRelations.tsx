import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Repeat2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { GraphEdge, GraphNode } from "../data/types";
import { getGraphLookups } from "../data/graph-lookups";
import { nodeType } from "../data/graph-model";
import { EDGE_KIND_LABELS, NODE_TYPE_LABELS } from "../data/labels";
import type { WorkbenchState } from "./state";
import { NativePreviewButton } from "./NativePreviewButton";
import { groupNodeRelations } from "./node-relations";

const PAGE_SIZE = 12;
const GROUPS = [
  { key: "outgoing", label: "出向关系", description: "此节点指向", icon: ArrowUpRight },
  { key: "incoming", label: "入向关系", description: "指向此节点", icon: ArrowDownLeft },
  { key: "self", label: "自身关系", description: "起点与终点均为此节点", icon: Repeat2 },
] as const;

function RelationGroup({
  group, edges, node, state,
}: {
  group: typeof GROUPS[number];
  edges: readonly GraphEdge[];
  node: GraphNode;
  state: WorkbenchState;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const byIndex = getGraphLookups(state.view).byIndex;
  const Icon = group.icon;
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="group w-full justify-start gap-2">
          <Icon data-icon="inline-start" />
          {group.label}
          <Badge variant="secondary">{edges.length.toLocaleString()}</Badge>
          <ChevronDown data-icon="inline-end" className="ml-auto transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1 pt-1">
          {edges.slice(0, limit).map((edge) => {
            const other = byIndex.get(edge.source === node.index ? edge.target : edge.source);
            const context = other && [...new Set([other.documentLabel || other.humanPath, other.heading].filter(Boolean))].join(" › ");
            return (
              <NativePreviewButton
                key={`${edge.kind}:${edge.source}:${edge.target}`}
                nativeId={other ? state.nativeBlockId(other.id) : null}
                variant="ghost"
                className="h-auto w-full flex-col items-start gap-1.5 py-2.5"
                onClick={() => state.inspectEdge(edge)}
                aria-label={`${group.description}：${other?.label ?? "未知端点"}，${EDGE_KIND_LABELS[edge.kind]}，查看关系详情`}
              >
                <span data-native-preview-anchor className="line-clamp-2 w-full whitespace-normal break-words text-left">
                  {other?.label ?? "未知端点"}
                </span>
                {context && <span className="w-full truncate text-left text-xs text-muted-foreground" title={other?.humanPath}>{context}</span>}
                <span className="flex w-full flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{EDGE_KIND_LABELS[edge.kind]}</Badge>
                  {edge.ambiguous && <Badge variant="secondary">同名候选</Badge>}
                  {other && <span className="text-xs text-muted-foreground">{NODE_TYPE_LABELS[nodeType(other)] ?? nodeType(other)}</span>}
                  {edge.weight > 1 && <span className="ml-auto text-xs text-muted-foreground">{edge.weight.toLocaleString()} 条记录</span>}
                </span>
              </NativePreviewButton>
            );
          })}
          {!edges.length && <p className="px-2.5 py-2 text-xs text-muted-foreground">当前没有{group.label}。</p>}
          {edges.length > limit && (
            <Button variant="outline" size="sm" className="mt-1 w-full" onClick={() => setLimit(value => value + PAGE_SIZE)}>
              显示更多{group.label}（剩余 {(edges.length - limit).toLocaleString()}）
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function NodeRelations({ node, state }: { node: GraphNode; state: WorkbenchState }) {
  const incident = getGraphLookups(state.view).incidentEdges(node.index);
  const groups = useMemo(() => groupNodeRelations(node.index, incident), [node.index, incident]);
  return (
    <section aria-label="当前显示的关系" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">当前显示的关系</h3>
        <Badge variant="outline">{incident.length.toLocaleString()}</Badge>
      </div>
      {incident.length > 0 ? (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">悬浮预览原文 · 点击查看关系详情</p>
          {GROUPS.filter(group => group.key !== "self" || groups.self.length).map(group => (
            <RelationGroup key={group.key} group={group} edges={groups[group.key]} node={node} state={state} />
          ))}
        </>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>当前没有显示的关系</EmptyTitle>
            <EmptyDescription>可调整图谱筛选与扩展范围。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}
