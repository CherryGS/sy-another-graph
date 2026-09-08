import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  Activity,
  Bookmark,
  Check,
  Download,
  Network,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ExplorePage } from "./ExplorePage";
import { SettingsPanel } from "./SettingsPanel";
import { useHostVisibility } from "./host-visibility";
import { useWorkbench } from "./state";

export function Layout() {
  const state = useWorkbench();
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState("");
  const pathname = useLocation({ select: (location) => location.pathname });
  const isExplore = pathname === "/";
  const hostActive = useHostVisibility();
  useEffect(() => {
    if (state.toast) toast(state.toast);
  }, [state.toast]);
  return (
    <TooltipProvider>
      <div
        className="workbench"
        data-host-active={hostActive}
        data-snapshot={state.data?.loadedAt}
      >
        <header className="app-toolbar">
          <nav className="main-nav" aria-label="图谱导航">
            <Button
              asChild
              variant={isExplore ? "secondary" : "ghost"}
              size="sm"
            >
              <Link to="/">
                <Network data-icon="inline-start" />
                图谱
              </Link>
            </Button>
            <Button
              asChild
              variant={pathname === "/insights" ? "secondary" : "ghost"}
              size="sm"
            >
              <Link to="/insights">
                <Activity data-icon="inline-start" />
                洞察
              </Link>
            </Button>
            <Button
              asChild
              variant={pathname === "/saved" ? "secondary" : "ghost"}
              size="sm"
            >
              <Link to="/saved">
                <Bookmark data-icon="inline-start" />
                已保存
                {state.savedViews.length > 0 && (
                  <Badge variant="outline">{state.savedViews.length}</Badge>
                )}
              </Link>
            </Button>
          </nav>
          <div className="header-actions">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="刷新图谱"
              title="重新读取工作空间"
              onClick={() => void state.load()}
            >
              {state.loading ? <Spinner /> : <RefreshCw />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="导出当前图谱 JSON"
              aria-label="导出当前图谱"
              disabled={!state.data || !!state.loading || state.exporting}
              onClick={() => void state.exportGraph()}
            >
              {state.exporting ? <Spinner /> : <Download />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="保存视图"
              title="保存视图"
              disabled={!state.data || !!state.loading}
              onClick={() => {
                setViewName(`视图 ${state.savedViews.length + 1}`);
                setSaving(true);
              }}
            >
              <Save />
            </Button>
            <SettingsPanel state={state} />
          </div>
        </header>
        {state.exportFile && (
          <Alert className="export-banner rounded-none border-x-0 border-t-0">
            <AlertDescription className="flex w-full flex-row flex-wrap items-center justify-between gap-2">
              <span>
                JSON · {state.exportFile.nodesCount.toLocaleString()} 节点 ·{" "}
                {state.exportFile.edgesCount.toLocaleString()} 关系
              </span>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <a
                    href={state.exportFile.url}
                    download={state.exportFile.name}
                  >
                    <Download data-icon="inline-start" />
                    下载 JSON
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="关闭下载提示"
                  onClick={state.dismissExport}
                >
                  <X />
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        {!!state.data?.warnings.length && (
          <Collapsible className="border-b">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
              >
                读取提示
                <Badge variant="outline">{state.data.warnings.length}</Badge>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent
              className="max-h-36 overflow-y-auto"
              data-scroll-panel
            >
              {state.data.warnings.map((warning) => (
                <Alert key={warning}>
                  <AlertTitle>数据读取提示</AlertTitle>
                  <AlertDescription>{warning}</AlertDescription>
                </Alert>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
        <main className="main-content">
          <div
            className="route-layer graph-route"
            data-route-active={isExplore}
            aria-hidden={!isExplore}
            inert={!isExplore}
          >
            <ExplorePage active={isExplore && hostActive} />
          </div>
          {!isExplore && (
            <div className="route-layer auxiliary-route">
              <Outlet />
            </div>
          )}
        </main>
        <Toaster theme="dark" closeButton />
        <Dialog open={saving} onOpenChange={setSaving}>
          <DialogContent>
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!viewName.trim()) return;
                state.saveView(viewName);
                setSaving(false);
              }}
            >
              <DialogHeader>
                <DialogTitle>保存视图</DialogTitle>
                <DialogDescription>
                  保留筛选条件与当前查看节点，存于当前浏览器。
                </DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="view-name">名称</FieldLabel>
                  <Input
                    autoFocus
                    id="view-name"
                    maxLength={80}
                    required
                    value={viewName}
                    onChange={(event) => setViewName(event.target.value)}
                  />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSaving(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={!viewName.trim()}>
                  <Check data-icon="inline-start" />
                  保存
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
