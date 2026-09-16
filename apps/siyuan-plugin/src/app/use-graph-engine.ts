import { useEffect, useRef, useState } from "react";
import { createGraphEngine, type GraphEngine } from "../engine/client";
import { numericTopology, type CurrentGraph } from "../data/graph-model";

export interface LoadedGraphEngine {
  graph: CurrentGraph;
  engine: GraphEngine;
  topology: ReturnType<typeof numericTopology>;
}

export function useGraphEngine(graph: CurrentGraph | null, reportError: (message: string) => void) {
  const [loaded, setLoaded] = useState<LoadedGraphEngine | null>(null);
  const [failure, setFailure] = useState<{
    graph: CurrentGraph;
    message: string;
  } | null>(null);
  const current = useRef<LoadedGraphEngine | null>(null);
  useEffect(() => {
    if (!graph) return;
    const engine = createGraphEngine();
    const topology = numericTopology(graph);
    let active = true;
    current.current = null;
    void engine
      .load(graph.nodes.length, topology.endpoints)
      .then(() => {
        if (!active) return;
        const result = { graph, engine, topology };
        current.current = result;
        setLoaded(result);
      })
      .catch((error: unknown) => {
        if (active) {
          const message = error instanceof Error ? error.message : String(error);
          setFailure({ graph, message });
          reportError(message);
        }
      });
    return () => {
      active = false;
      current.current = null;
      engine.dispose();
    };
  }, [graph, reportError]);
  return {
    loaded: loaded?.graph === graph ? loaded : null,
    current,
    loading: graph !== null && loaded?.graph !== graph && failure?.graph !== graph,
    error: failure?.graph === graph ? failure.message : "",
  };
}
