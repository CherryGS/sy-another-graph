import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";
import { toast } from "sonner";
import { Toaster } from "@/shared/ui/sonner";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { ExplorePage } from "./ExplorePage";
import { useHostVisibility } from "../../adapters/siyuan/bridge/host-visibility";
import { useWorkbench } from "../model/state";

export function Layout() {
  const state = useWorkbench();
  const hostActive = useHostVisibility();
  useEffect(() => {
    if (state.toast) toast(state.toast);
  }, [state.toast]);
  return (
    <TooltipProvider>
      <div className="workbench" data-host-active={hostActive} data-snapshot={state.data?.loadedAt}>
        <main className="main-content">
          <ExplorePage active={hostActive} />
          <Outlet />
        </main>
        <Toaster theme="dark" closeButton />
      </div>
    </TooltipProvider>
  );
}
