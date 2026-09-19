import { useEffect, useMemo, useState } from "react";
import type { GraphDirection } from "../../application/sessions/graph-engine";
import type { CurrentGraph } from "../../core/scope/graph-model";
import { failureOf, type Failure } from "../../core/diagnostics/message";
import { graphLayers, type GraphLayers } from "../../modules/layout/layers";
import type { LoadedGraphEngine } from "./use-graph-engine";

/** Distance computation shares the revision-owned engine, never the truncated highlight result. */
export function useLayeredLayout(
  graph: CurrentGraph | null,
  loaded: LoadedGraphEngine | null,
  enabled: boolean,
  chosenIds: readonly string[],
  direction: GraphDirection,
  waiting: boolean,
) {
  const chosenKey = JSON.stringify([...chosenIds].sort());
  const input = useMemo(
    () => ({ graph, loaded, enabled, chosenKey, direction, waiting }),
    [graph, loaded, enabled, chosenKey, direction, waiting],
  );
  const [result, setResult] = useState<{
    input: typeof input;
    layers?: GraphLayers;
    error?: Failure;
  } | null>(null);
  useEffect(() => {
    const { graph, loaded, enabled, chosenKey, direction, waiting } = input;
    if (!enabled || !graph || !loaded || loaded.graph !== graph || waiting || chosenKey === "[]") {
      // eslint-disable-next-line react/set-state-in-effect -- Release an obsolete analysis when its source/seed request is unavailable.
      setResult(null);
      return;
    }
    let active = true;
    const seeds = (JSON.parse(chosenKey) as string[]).flatMap((id) => {
      const dense = loaded.topology.idToDense.get(id);
      return dense === undefined ? [] : [dense];
    });
    void loaded.engine.distances(seeds, direction).then(
      (distances) => {
        if (active) {
          try {
            setResult({ input, layers: graphLayers(graph, distances) });
          } catch (error) {
            setResult({ input, error: failureOf(error) });
          }
        }
      },
      (error: unknown) => {
        if (active) setResult({ input, error: failureOf(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [input]);
  const current = result?.input === input ? result : null;
  return {
    layers: current?.layers,
    error: current?.error,
    pending: enabled && !!graph && chosenIds.length > 0 && !current,
  };
}
