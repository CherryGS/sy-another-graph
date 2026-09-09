import { useId, useMemo, type RefObject } from "react";
import { List } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getNodeTypeCounts } from "../data/graph-summary";
import { NODE_TYPE_LABELS } from "../data/labels";
import {
  NODE_TYPE_COLORS,
  nodeTypeColor,
} from "./node-colors";
import type { CanvasNode } from "./types";

export function GraphLegend({
  nodes,
  anchorRef,
}: {
  nodes: readonly CanvasNode[];
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const types = useMemo(() => {
    const order = Object.keys(NODE_TYPE_COLORS);
    return [...getNodeTypeCounts(nodes)].sort(([left], [right]) => {
      const leftIndex = order.indexOf(left);
      const rightIndex = order.indexOf(right);
      return (
        (leftIndex < 0 ? order.length : leftIndex) -
          (rightIndex < 0 ? order.length : rightIndex) ||
        left.localeCompare(right)
      );
    });
  }, [nodes]);

  return (
    <Popover>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={!nodes.length}>
          <List data-icon="inline-start" />
          图例
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-labelledby={titleId}
        className="legend-popover gap-0 p-0"
      >
        <PopoverHeader className="px-3 py-3">
          <PopoverTitle id={titleId}>节点类型与数量</PopoverTitle>
        </PopoverHeader>
        <ScrollArea className="legend-scroll" data-scroll-panel>
          <div
            role="region"
            aria-label="节点类型列表"
            tabIndex={0}
            className="flex flex-col gap-3 px-3 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
          >
            <dl className="flex flex-col gap-1 text-sm">
              {types.map(([type, count]) => {
                const label = Object.hasOwn(NODE_TYPE_LABELS, type)
                  ? NODE_TYPE_LABELS[type]
                  : type;
                return (
                  <div className="flex min-w-0 items-center gap-3 py-1.5" key={type}>
                    <dt className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: nodeTypeColor(type) }}
                      />
                      <span className="truncate" title={label}>{label}</span>
                    </dt>
                    <dd className="shrink-0 text-right tabular-nums">
                      {count.toLocaleString()}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p className="text-xs leading-relaxed text-muted-foreground">
              数量基于当前图谱节点；色点对应按类型着色。
            </p>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
