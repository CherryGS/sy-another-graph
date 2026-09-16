import { useId, useMemo, type RefObject } from "react";
import { List } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/shared/ui/popover";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Separator } from "@/shared/ui/separator";
import { getNodeTypeCounts } from "../../core/graph/graph-summary";
import { NODE_TYPE_LABELS } from "../presentation/graph-labels";
import { NODE_TYPE_COLORS, nodeTypeColor } from "../presentation/node-colors";
import type { GraphNode } from "../../core/graph/types";
import {
  SEARCH_ORIGIN_LABELS,
  SEARCH_MATCH_RING_COLOR,
  searchNodeOrigin,
  type SearchOrigin,
  type SearchOrigins,
} from "../../modules/search/origins";

export function GraphLegend({
  nodes,
  searchOrigins,
  anchorRef,
}: {
  nodes: readonly GraphNode[];
  searchOrigins?: SearchOrigins;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const origins = useMemo(() => {
    if (!searchOrigins) return null;
    const counts: Record<SearchOrigin, number> = { match: 0, "projected-match": 0, ancestor: 0 };
    for (const node of nodes) counts[searchNodeOrigin(node.id, searchOrigins)!]++;
    return counts;
  }, [nodes, searchOrigins]);
  const types = useMemo(() => {
    const order = Object.keys(NODE_TYPE_COLORS);
    return [...getNodeTypeCounts(nodes)].sort(([left], [right]) => {
      const leftIndex = order.indexOf(left);
      const rightIndex = order.indexOf(right);
      return (
        (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex) ||
        left.localeCompare(right)
      );
    });
  }, [nodes]);

  return (
    <Popover>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={!nodes.length}>
          <List data-icon="inline-start" />
          图例
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-labelledby={titleId} className="legend-popover gap-0 p-0">
        <PopoverHeader className="px-3 py-3">
          <PopoverTitle id={titleId}>图例</PopoverTitle>
        </PopoverHeader>
        <ScrollArea className="legend-scroll" data-scroll-panel>
          <div
            role="region"
            aria-label="节点类型列表"
            tabIndex={0}
            className="flex flex-col gap-3 px-3 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
          >
            {origins && (
              <>
                <dl className="flex flex-col gap-2 text-sm" aria-label="搜索来源图例">
                  {(["match", "projected-match", "ancestor"] as const)
                    .filter((origin) => origin !== "projected-match" || origins[origin] > 0)
                    .map((origin) => (
                      <div key={origin} className="flex items-center gap-3">
                        <dt className="flex flex-1 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="flex size-3.5 shrink-0 items-center justify-center rounded-full border-2"
                            style={{
                              borderColor:
                                origin === "ancestor" ? "transparent" : SEARCH_MATCH_RING_COLOR,
                            }}
                          >
                            <span className="size-1 rounded-full bg-foreground" />
                          </span>
                          {origin === "ancestor" ? "无色环" : "洋红色环"} ·{" "}
                          {SEARCH_ORIGIN_LABELS[origin]}
                        </dt>
                        <dd className="tabular-nums">{origins[origin].toLocaleString()}</dd>
                      </div>
                    ))}
                </dl>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  洋红色环标记搜索命中及其文档投影，小节点也保留可见环宽。节点颜色和标签沿用原样，选中与查看状态仍使用原有标记。数量以当前可见节点为准。
                </p>
                <Separator />
              </>
            )}
            <p className="text-sm font-medium">节点类型与数量</p>
            <dl className="flex flex-col gap-1 text-sm">
              {types.map(([type, count]) => {
                const label = Object.hasOwn(NODE_TYPE_LABELS, type) ? NODE_TYPE_LABELS[type] : type;
                return (
                  <div className="flex min-w-0 items-center gap-3 py-1.5" key={type}>
                    <dt className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: nodeTypeColor(type) }}
                      />
                      <span className="truncate" title={label}>
                        {label}
                      </span>
                    </dt>
                    <dd className="shrink-0 text-right tabular-nums">{count.toLocaleString()}</dd>
                  </div>
                );
              })}
            </dl>
            <p className="text-xs leading-relaxed text-muted-foreground">
              数量基于当前图谱节点；色点对应按类型着色。
            </p>
            <div
              className="flex flex-col gap-1 text-xs text-muted-foreground"
              aria-label="关系线型"
            >
              <span>实线：块引用和数据库关系</span>
              <span>虚线：包含关系</span>
              <span>金色点线：文本提及候选，可查看命中依据</span>
            </div>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
