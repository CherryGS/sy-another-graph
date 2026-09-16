import type { GraphLike } from "../../core/graph/graph-lookups";
import type { ExportFile } from "../../modules/export/export";
import { createContext, useContext, useEffect, type ComponentType, type ReactNode } from "react";
import type { SourceStore } from "../../application/workspace/source-store";
import type { GraphEngine } from "../../application/sessions/graph-engine";
import type { GraphCanvasProps } from "../presentation/types";

export interface WorkbenchServices {
  workspace: SourceStore;
  connectSource: () => () => void;
  createEngine: () => GraphEngine;
  exportGraph: (view: GraphLike, signal: AbortSignal) => Promise<ExportFile>;
  Renderer: ComponentType<GraphCanvasProps>;
}

const ServicesContext = createContext<WorkbenchServices | null>(null);

export function WorkbenchServicesProvider({
  services,
  children,
}: {
  services: WorkbenchServices;
  children: ReactNode;
}) {
  useEffect(() => {
    const detach = services.connectSource();
    void services.workspace.refresh();
    return () => {
      detach();
      services.workspace.dispose();
    };
  }, [services]);
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

// eslint-disable-next-line react/only-export-components -- The service context and its hook share one ownership boundary.
export function useWorkbenchServices(): WorkbenchServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("Workbench services missing");
  return services;
}
