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
import { Separator } from "@/components/ui/separator";
import { nodeType } from "../data/graph-model";
import { NODE_TYPE_LABELS } from "../data/labels";
import {
  EXTERNAL_NODE_COLOR,
  NODE_TYPE_COLORS,
  nodeTypeColor,
  type GraphColorMode,
} from "./node-colors";
import type { CanvasNode } from "./types";

export function GraphLegend({
  nodes,
  colorBy,
  anchorRef,
}: {
  nodes: readonly CanvasNode[];
  colorBy: GraphColorMode;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const { types, external } = useMemo(() => {
    const counts = new Map<string, number>();
    let external = 0;
    for (const node of nodes) {
      const type = nodeType(node);
      counts.set(type, (counts.get(type) ?? 0) + 1);
      if (node.external) external += 1;
    }
    const order = Object.keys(NODE_TYPE_COLORS);
    const types = [...counts].sort(([left], [right]) => {
      const leftIndex = order.indexOf(left);
      const rightIndex = order.indexOf(right);
      return (
        (leftIndex < 0 ? order.length : leftIndex) -
          (rightIndex < 0 ? order.length : rightIndex) ||
        left.localeCompare(right)
      );
    });
    return { types, external };
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
            {external > 0 && (
              <>
                <Separator />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    {colorBy !== "type" && (
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: EXTERNAL_NODE_COLOR }}
                      />
                    )}
                    ↗ 范围外补充
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    {external.toLocaleString()}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  ↗ 标记补充显示的范围外节点，已计入各类型数量。
                </p>
              </>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
