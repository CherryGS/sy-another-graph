import { useId, useMemo, useRef, useState, type RefObject } from "react";
import { Search, X } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { WorkbenchState } from "./state";
import { nodeColor } from "../graph/node-colors";
import { nodeType } from "../data/graph-model";
import { NODE_TYPE_LABELS } from "../data/labels";

export function GraphSearch({
  state,
  anchorRef,
}: {
  state: WorkbenchState;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const { filters, setFilters } = state;
  const [open, setOpen] = useState(false);
  const resultsId = useId();
  const input = useRef<HTMLInputElement>(null);
  const firstResult = useRef<HTMLButtonElement>(null);
  const focusFirstOnOpen = useRef(false);
  const restoreInputAfterEscape = useRef(false);
  const chosen = useMemo(() => new Set(state.chosenIds), [state.chosenIds]);
  const notebooks = useMemo(
    () =>
      new Map(state.data?.notebooks.map((book) => [book.id, book.name]) ?? []),
    [state.data?.notebooks],
  );
  return (
    <Popover open={open && !!filters.query.trim()} onOpenChange={setOpen}>
      <PopoverAnchor virtualRef={anchorRef} />
      <InputGroup className="search-group">
        <InputGroupInput
          ref={input}
          aria-label="搜索图谱节点"
          aria-expanded={open && !!filters.query.trim()}
          aria-controls={resultsId}
          placeholder="查找节点标题或 ID…"
          value={filters.query}
          onFocus={() => {
            if (!restoreInputAfterEscape.current) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && filters.query.trim()) {
              event.preventDefault();
              if (open) firstResult.current?.focus();
              else {
                focusFirstOnOpen.current = true;
                setOpen(true);
              }
            }
          }}
          onChange={(event) => {
            setOpen(true);
            setFilters((previous) => ({
              ...previous,
              query: event.target.value,
            }));
          }}
        />
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        {filters.query && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="清空搜索"
              onClick={() =>
                setFilters((previous) => ({ ...previous, query: "" }))
              }
            >
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
      <PopoverContent
        aria-label="搜索结果"
        align="start"
        className="search-popover p-1"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (focusFirstOnOpen.current) firstResult.current?.focus();
          focusFirstOnOpen.current = false;
        }}
        onEscapeKeyDown={() => {
          restoreInputAfterEscape.current = true;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (restoreInputAfterEscape.current) input.current?.focus();
          restoreInputAfterEscape.current = false;
        }}
      >
        <ScrollArea
          id={resultsId}
          aria-label="节点搜索结果"
          className="search-results"
          data-scroll-panel
        >
          {state.results.length ? (
            <div className="flex flex-col gap-1">
              {state.results.map((node, index) => (
                <Button
                  ref={index === 0 ? firstResult : undefined}
                  key={node.id}
                  variant={chosen.has(node.id) ? "secondary" : "ghost"}
                  className="h-auto w-full justify-start py-2"
                  onClick={(event) =>
                    state.setSelectedId(node.id, {
                      shiftKey: event.shiftKey,
                      detail: event.detail,
                    })
                  }
                  onDoubleClick={() => state.openDocument(node.id)}
                >
                  <span
                    className="color-dot"
                    style={{ background: nodeColor(node, state.colorBy) }}
                  />
                  <span className="min-w-0 text-left">
                    <span className="block truncate">{node.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        NODE_TYPE_LABELS[nodeType(node)] ?? nodeType(node),
                        node.external && "↗ 范围外补充",
                        node.humanPath || node.documentLabel,
                        node.heading,
                        notebooks.get(node.notebook),
                      ]
                        .filter(Boolean)
                        .join(" · ") || node.id}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>没有匹配节点</EmptyTitle>
                <EmptyDescription>请尝试其他标题或 ID。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
