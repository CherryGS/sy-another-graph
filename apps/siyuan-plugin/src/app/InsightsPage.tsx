import { useMemo } from "react";
import {
  Activity,
  ArrowUpRight,
  Boxes,
  ChevronDown,
  CircleDot,
  GitBranch,
  Link2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
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
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkbench } from "./state";

export function InsightsPage() {
  const state = useWorkbench();
  const navigate = useNavigate();
  const { data, stats, currentGraph } = state;
  const structure = useMemo(() => {
    if (!currentGraph || !stats) return null;
    const isolated = currentGraph.nodes.reduce(
      (count, node) => count + Number(node.degree === 0),
      0,
    );
    let references = 0;
    let referenceRecords = 0;
    for (const edge of currentGraph.edges) {
      if (edge.kind !== "reference") continue;
      references += 1;
      referenceRecords += edge.weight;
    }
    const connected = currentGraph.nodes.length - isolated;
    return {
      isolated,
      connected,
      references,
      referenceRecords,
      coverage: currentGraph.nodes.length
        ? (connected / currentGraph.nodes.length) * 100
        : 0,
      averageDegree: currentGraph.nodes.length
        ? stats.degrees.reduce((total, degree) => total + degree, 0) /
          currentGraph.nodes.length
        : 0,
      topNodes: currentGraph.nodes
        .slice()
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 8),
    };
  }, [currentGraph, stats]);

  if (!data || !stats || !currentGraph || !structure)
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Activity />
          </EmptyMedia>
          <EmptyTitle>图谱加载完成后，这里会呈现它的结构</EmptyTitle>
          <EmptyDescription>{state.error || state.loading}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  const metrics = [
    {
      label: "可探索节点",
      value: currentGraph.nodes.length.toLocaleString(),
      detail: `${data.notebooks.length} 个笔记本`,
      Icon: CircleDot,
    },
    {
      label: "引用关系",
      value: structure.references.toLocaleString(),
      detail: `${structure.referenceRecords.toLocaleString()} 条源引用记录`,
      Icon: Link2,
    },
    {
      label: "连通分量",
      value: stats.components.toLocaleString(),
      detail: `最大分量 ${stats.largestComponent.toLocaleString()} 个节点`,
      Icon: Boxes,
    },
    {
      label: "平均连接度",
      value: structure.averageDegree.toFixed(2),
      detail: `${structure.isolated.toLocaleString()} 个孤立节点`,
      Icon: GitBranch,
    },
  ];
  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">洞察</h2>
          <Badge variant="outline">思源工作空间</Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, detail, Icon }) => (
            <Card size="sm" key={label}>
              <CardHeader>
                <CardDescription>
                  <Badge variant="outline">
                    <Icon aria-hidden="true" />
                    {label}
                  </Badge>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                <strong className="text-3xl font-semibold tabular-nums">
                  {value}
                </strong>
                <p className="text-xs text-muted-foreground">{detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>连接枢纽</CardTitle>
              <CardDescription>按连接度排序</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {structure.topNodes.length ? (
                structure.topNodes.map((node, index) => (
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start gap-3 py-3"
                    key={node.id}
                    onClick={() => {
                      state.setSelectedId(node.id);
                      void navigate({ to: "/" });
                    }}
                  >
                    <span className="w-5 shrink-0 tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: node.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-left">
                      {node.label}
                    </span>
                    <Progress
                      className="hidden w-20 sm:flex"
                      value={
                        (node.degree / (structure.topNodes[0]?.degree || 1)) *
                        100
                      }
                      aria-label={`${node.label} 相对连接度`}
                    />
                    <Badge variant="secondary">{node.degree}</Badge>
                    <ArrowUpRight data-icon="inline-end" />
                  </Button>
                ))
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>暂无可探索节点</EmptyTitle>
                    <EmptyDescription>
                      调整图谱的类型与关系设置后查看连接枢纽。
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>知识覆盖</CardTitle>
              <CardDescription>节点连接情况</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline gap-2">
                  <strong className="text-4xl font-semibold tabular-nums">
                    {Math.round(structure.coverage)}%
                  </strong>
                  <span className="text-sm text-muted-foreground">
                    节点已有连接
                  </span>
                </div>
                <Progress
                  value={structure.coverage}
                  aria-label="节点已有连接"
                />
              </div>
              <dl className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <dt className="text-sm text-muted-foreground">已连接</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {structure.connected.toLocaleString()}
                  </dd>
                </div>
                <div className="flex flex-col gap-2">
                  <dt className="text-sm text-muted-foreground">孤立节点</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {structure.isolated.toLocaleString()}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        <Collapsible asChild>
          <Card className="runtime-card">
            <CardHeader>
              <CardTitle>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="group w-full justify-start"
                  >
                    <Zap data-icon="inline-start" />
                    运行信息
                    <ChevronDown
                      data-icon="inline-end"
                      className="ml-auto transition-transform group-data-[state=open]:rotate-180"
                    />
                  </Button>
                </CollapsibleTrigger>
              </CardTitle>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="flex flex-col gap-4">
                <div className="runtime-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      图计算核心
                    </span>
                    <strong className="text-sm font-medium">
                      {stats.backend}
                    </strong>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      数据传输
                    </span>
                    <strong className="text-sm font-medium">
                      {stats.transport === "shared"
                        ? "共享缓冲区"
                        : "Transferable 缓冲区"}
                    </strong>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      数据读取
                    </span>
                    <strong className="text-sm font-medium tabular-nums">
                      {data.loadMs.toFixed(1)} ms
                    </strong>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      图索引构建
                    </span>
                    <strong className="text-sm font-medium tabular-nums">
                      {stats.buildMs.toFixed(1)} ms
                    </strong>
                  </div>
                </div>
                <Alert className="runtime-note" role="note">
                  <ShieldCheck />
                  <AlertDescription>
                    {stats.transport === "shared"
                      ? "当前环境支持共享缓冲区传输；图算法仍运行在专用 Worker 中。"
                      : "当前思源页面未启用跨源隔离，使用可转移缓冲区。图计算在专用 Worker 中进行。"}
                  </AlertDescription>
                </Alert>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  统计覆盖初始范围内符合当前类型与关系设置的内容，跳数与高亮不改变统计范围。
                  {data.skippedReferences > 0 &&
                    ` 已略过 ${data.skippedReferences.toLocaleString()} 条端点不可用的源引用记录。`}
                </p>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </ScrollArea>
  );
}
