import { useId, useState } from "react";
import { ChevronDown, GitBranch, X } from "lucide-react";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { WorkbenchState } from "./state";
import { nodeColor } from "../graph/node-colors";
import { nodeType } from "../data/graph-model";
import { NODE_TYPE_LABELS } from "../data/labels";
import { NodeRelations } from "./NodeRelations";

export function NodeInspector({ state }: { state: WorkbenchState }) {
  const [target, setTarget] = useState("");
  const targetId = useId();
  const node = state.selected;
  if (!node) return null;
  const notebook = state.data?.notebooks.find(
    (book) => book.id === node.notebook,
  );

  return (
    <aside className="inspector-panel" aria-label="节点详情">
      <Card className="h-full min-h-0">
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: nodeColor(node, state.colorBy) }}
            />
            <span className="min-w-0 truncate" title={node.label}>
              {node.label}
            </span>
          </CardTitle>
          <CardAction>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="关闭节点详情"
                  onClick={state.closeInspector}
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent>关闭节点详情</TooltipContent>
            </Tooltip>
          </CardAction>
          <CardDescription>
            <Badge variant="secondary">
              {NODE_TYPE_LABELS[nodeType(node)] ?? nodeType(node)}
            </Badge>
            {node.notebook && (
              <span className="ml-2 break-words">
                {notebook?.name ?? node.notebook}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <ScrollArea data-scroll-panel className="min-h-0 flex-1">
          <CardContent className="flex min-w-0 flex-col gap-4">
            {(node.humanPath || node.documentLabel) && (
              <p className="break-words text-xs leading-relaxed text-muted-foreground">
                {node.humanPath || node.documentLabel}
                {node.heading && ` › ${node.heading}`}
              </p>
            )}
            {node.content && (node.blockType !== "d" || node.content.trim() !== node.label.trim()) && (
              <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
                {node.content}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              双击画布节点或标签可打开原文。
            </p>
            <Separator />
            <NodeRelations node={node} state={state} />
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="group w-full justify-between"
                >
                  节点信息
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
                    <p className="break-all">数据库：{node.databaseId}</p>
                  )}
                  {node.itemId && (
                    <p className="break-all">条目：{node.itemId}</p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="group w-full justify-between"
                >
                  已有路径工具
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
                      <FieldLabel htmlFor={targetId}>目标标题或 ID</FieldLabel>
                      <Input
                        id={targetId}
                        aria-label="路径目标节点"
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
                      查找路径
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
