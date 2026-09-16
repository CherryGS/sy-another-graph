import { prepareGraphExport } from "../modules/export/export";
import { writeGraphFile } from "../adapters/siyuan/data/export-file";
import type { WorkbenchServices } from "../workbench/model/services";
import { SourceStore } from "../application/workspace/source-store";
import { loadSiYuanGraph } from "../adapters/siyuan/data/source";
import { subscribeSourceRefresh } from "../adapters/siyuan/bridge/source-subscription";
import { createGraphEngine } from "../adapters/wasm/client";
import { CosmographCanvas } from "../adapters/cosmograph/CosmographCanvas";
import { WorkbenchServicesProvider } from "../workbench/model/services";
import { createRoot } from "react-dom/client";
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  RouterProvider,
} from "@tanstack/react-router";
import { Layout } from "../workbench/ui/Layout";
import { WorkbenchProvider } from "../workbench/model/state";
import "../workbench/styles/theme.css";
import "../workbench/styles/styles.css";

const rootRoute = createRootRoute({
  component: Layout,
  notFoundComponent: () => <Navigate to="/" replace />,
});
const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => null,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([graphRoute]),
  history: createHashHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const workspace = new SourceStore(loadSiYuanGraph, {
  delay: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
  cancel: (id) => window.clearTimeout(id),
});
const services: WorkbenchServices = {
  workspace,
  connectSource: () => subscribeSourceRefresh(window, workspace),
  createEngine: createGraphEngine,
  exportGraph: (view, signal) => prepareGraphExport(view, signal, writeGraphFile),
  Renderer: CosmographCanvas,
};
document.documentElement.classList.add("dark");
createRoot(document.getElementById("root")!).render(
  <WorkbenchServicesProvider services={services}>
    <WorkbenchProvider>
      <RouterProvider router={router} />
    </WorkbenchProvider>
  </WorkbenchServicesProvider>,
);
