import { createRoot } from "react-dom/client";
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { ExplorePage } from "./ExplorePage";
import { InsightsPage } from "./InsightsPage";
import { Layout } from "./Layout";
import { SavedPage } from "./SavedPage";
import { WorkbenchProvider } from "./state";
import "./styles.css";

const rootRoute = createRootRoute({ component: Layout });
const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ExplorePage,
});
const insightsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/insights",
  component: InsightsPage,
});
const savedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/saved",
  component: SavedPage,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([graphRoute, insightsRoute, savedRoute]),
  history: createHashHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <WorkbenchProvider>
    <RouterProvider router={router} />
  </WorkbenchProvider>,
);
