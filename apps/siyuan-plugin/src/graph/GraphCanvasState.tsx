import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

interface GraphCanvasStateProps {
  error: string | null;
  loading: boolean;
  initializing: boolean;
  preparing: boolean;
  nodeCount: number;
  onRetry(): void;
}

export function GraphCanvasState({ error, loading, initializing, preparing, nodeCount, onRetry }: GraphCanvasStateProps) {
  if (error) return (
    <div className="ag-canvas__state">
      <Alert variant="destructive">
        <AlertTitle>图谱暂时无法显示</AlertTitle>
        <AlertDescription>
          <div className="flex flex-col items-start gap-3">
            <p>{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>重试图谱</Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
  if (loading) return (
    <div className="ag-canvas__state">
      <Alert role="status">
        <Spinner aria-hidden="true" className="motion-reduce:animate-none" />
        <AlertTitle>{initializing ? "正在启动图谱引擎" : preparing ? "正在准备图谱数据" : "正在绘制知识连接"}</AlertTitle>
        <AlertDescription>{nodeCount.toLocaleString()} 个节点 · 在本机处理</AlertDescription>
      </Alert>
    </div>
  );
  if (nodeCount) return null;
  return (
    <div className="ag-canvas__state">
      <Empty className="border bg-card text-card-foreground" role="status">
        <EmptyHeader>
          <EmptyTitle>当前范围中没有节点</EmptyTitle>
          <EmptyDescription>调整筛选条件，探索更多笔记。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
