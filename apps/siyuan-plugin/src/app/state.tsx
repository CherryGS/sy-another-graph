import { createContext, useContext, type ReactNode } from "react";
import { useWorkbenchState } from "./use-workbench-state";

export type WorkbenchState = ReturnType<typeof useWorkbenchState>;
const WorkbenchContext = createContext<WorkbenchState | null>(null);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  return (
    <WorkbenchContext.Provider value={useWorkbenchState()}>{children}</WorkbenchContext.Provider>
  );
}

// eslint-disable-next-line react/only-export-components -- This context hook belongs to its provider.
export function useWorkbench() {
  const state = useContext(WorkbenchContext);
  if (!state) throw new Error("Workbench provider missing");
  return state;
}
