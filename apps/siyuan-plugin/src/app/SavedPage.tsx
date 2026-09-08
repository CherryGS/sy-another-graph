import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Bookmark,
  Check,
  Clock3,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Alert, AlertAction, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SavedView } from "../data/views";
import { useWorkbench } from "./state";

export function SavedPage() {
  const state = useWorkbench();
  const navigate = useNavigate();
  const [deleted, setDeleted] = useState<SavedView | null>(null);
  const notebooks = state.data?.notebooks;
  const notebookNames = useMemo(
    () => new Map(notebooks?.map((book) => [book.id, book.name])),
    [notebooks],
  );

  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">保存的视图</h2>
          <Badge variant="outline">{state.savedViews.length} 个视图</Badge>
        </div>
        {deleted && (
          <Alert role="status">
            <Check />
            <AlertTitle>已移除「{deleted.name}」</AlertTitle>
            <AlertAction>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (state.persistViews([deleted, ...state.savedViews]))
                    setDeleted(null);
                }}
              >
                <RotateCcw data-icon="inline-start" />
                撤销
              </Button>
            </AlertAction>
          </Alert>
        )}
        {state.savedViews.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {state.savedViews.map((saved) => (
              <Card key={saved.id}>
                <CardHeader>
                  <Badge variant="secondary">
                    <Bookmark />
                    思源图谱
                  </Badge>
                  <CardTitle>
                    <span className="block truncate" title={saved.name}>
                      {saved.name}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {saved.filters.notebook
                      ? notebookNames.get(saved.filters.notebook) ||
                        "指定笔记本"
                      : "全部笔记本"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <div className="flex flex-wrap gap-1.5">
                    {saved.filters.references && (
                      <Badge variant="outline">引用</Badge>
                    )}
                    {saved.filters.hierarchy && (
                      <Badge variant="outline">层级</Badge>
                    )}
                    {saved.filters.databases && (
                      <Badge variant="outline">数据库成员</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <Badge variant="outline">
                      <Clock3 aria-hidden="true" />
                      <time dateTime={saved.createdAt}>
                        {new Date(saved.createdAt).toLocaleString("zh-CN")}
                      </time>
                    </Badge>
                  </p>
                </CardContent>
                <CardFooter className="justify-between gap-2">
                  <Button
                    variant="outline"
                    disabled={!!state.loading}
                    onClick={() => {
                      void state.restoreView(saved).then((restored) => {
                        if (restored) void navigate({ to: "/" });
                      });
                    }}
                  >
                    继续探索
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`移除视图 ${saved.name}`}
                        onClick={() => {
                          if (
                            state.persistViews(
                              state.savedViews.filter(
                                (item) => item.id !== saved.id,
                              ),
                            )
                          )
                            setDeleted(saved);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>移除视图</TooltipContent>
                  </Tooltip>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <Empty className="min-h-80">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bookmark />
              </EmptyMedia>
              <EmptyTitle>暂无保存的视图</EmptyTitle>
              <EmptyDescription>
                在图谱工具栏中保存筛选条件与当前查看节点。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => void navigate({ to: "/" })}>
                开始探索
                <ArrowRight data-icon="inline-end" />
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>
    </ScrollArea>
  );
}
