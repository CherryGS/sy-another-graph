import { createRoot } from "react-dom/client";
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  RouterProvider,
} from "@tanstack/react-router";
import { Layout } from "./Layout";
import { WorkbenchProvider } from "./state";
import "./theme.css";
import "./styles.css";

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

document.documentElement.classList.add("dark");
createRoot(document.getElementById("root")!).render(
  <WorkbenchProvider>
    <RouterProvider router={router} />
  </WorkbenchProvider>,
);
