import { useEffect, useMemo, useState } from "react";
import { failureOf, message, type Failure } from "../../core/diagnostics/message";
import type { CurrentGraph } from "../../core/scope/graph-model";
import { calculateDiscovery } from "../../modules/discovery/client";
import {
  prepareReferences,
  discoverySeeds,
  discoverySpotlight,
  type ReferenceGraph,
} from "../../modules/discovery/reference-graph";
import {
  DISCOVERY_LIMITS,
  type DiscoveryRequest,
  type DiscoveryResult,
  type DiscoveryRule,
} from "../../modules/discovery/types";

function useDiscoveryQuery(request: DiscoveryRequest | null) {
  const [state, setState] = useState<{
    request: DiscoveryRequest;
    result?: DiscoveryResult;
    error?: Failure;
  } | null>(null);
  useEffect(() => {
    if (!request) {
      // eslint-disable-next-line react/set-state-in-effect -- Release a closed/obsolete query's result and request buffers.
      setState(null);
      return;
    }
    const controller = new AbortController();
    void calculateDiscovery(request, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setState({ request, result });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ request, error: failureOf(error) });
      });
    return () => controller.abort();
  }, [request]);
  const current = state?.request === request ? state : null;
  return { result: current?.result, error: current?.error, pending: !!request && !current };
}

export function useDiscovery(
  graph: CurrentGraph | null,
  chosenIds: readonly string[],
  waiting: boolean,
) {
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState<DiscoveryRule>("shared-targets");
  const [retry, setRetry] = useState(0);
  const preparation = useMemo(
    () => ({ graph: open && !waiting ? graph : null, retry }),
    [graph, open, waiting, retry],
  );
  const [prepared, setPrepared] = useState<{
    input: typeof preparation;
    index?: ReferenceGraph;
    error?: Failure;
  } | null>(null);
  useEffect(() => {
    if (!preparation.graph) {
      // eslint-disable-next-line react/set-state-in-effect -- Dispose the closed/stale source preparation.
      setPrepared(null);
      return;
    }
    const controller = new AbortController();
    void prepareReferences(preparation.graph, controller.signal)
      .then((index) => {
        if (!controller.signal.aborted) setPrepared({ input: preparation, index });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setPrepared({ input: preparation, error: failureOf(error) });
      });
    return () => controller.abort();
  }, [preparation]);
  const current = prepared?.input === preparation ? prepared : null;
  const index = current?.index;
  const chosenKey = JSON.stringify([...chosenIds].sort());
  const origins = useMemo(
    () =>
      index ? discoverySeeds(index, JSON.parse(chosenKey) as string[]) : { seeds: [], skipped: 0 },
    [index, chosenKey],
  );
  const tooMany = origins.seeds.length > DISCOVERY_LIMITS.seeds;
  const query = useMemo<DiscoveryRequest | null>(
    () =>
      index && origins.seeds.length && !tooMany
        ? { nodes: index.documents.length, endpoints: index.endpoints, seeds: origins.seeds, rule }
        : null,
    [index, origins.seeds, tooMany, rule],
  );
  const ranking = useDiscoveryQuery(query);
  const candidates = ranking.result?.kind === "candidates" ? ranking.result : undefined;
  const [choice, setChoice] = useState<{ query: DiscoveryRequest; node: number } | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Release the old request's numeric buffers when its ownership changes or the panel closes.
    setChoice(null);
  }, [query]);
  const candidate =
    choice?.query === query && candidates?.candidates.some((item) => item.node === choice.node)
      ? choice.node
      : undefined;
  const detailRequest = useMemo(
    () => (query && candidate !== undefined ? { ...query, candidate } : null),
    [query, candidate],
  );
  const details = useDiscoveryQuery(detailRequest);
  const evidence = details.result?.kind === "evidence" ? details.result : undefined;
  const spotlight = useMemo(
    () =>
      index && evidence
        ? discoverySpotlight(index, rule, evidence.candidate, evidence.matches)
        : undefined,
    [index, evidence, rule],
  );
  return {
    open,
    setOpen,
    rule,
    setRule,
    index,
    origins,
    candidates,
    candidate,
    evidence,
    spotlight,
    pending: open && (waiting || (!!preparation.graph && !current) || ranking.pending),
    detailsPending: details.pending,
    detailError: details.error,
    error:
      current?.error ??
      (tooMany
        ? message("discovery.tooManySeeds", { count: DISCOVERY_LIMITS.seeds })
        : ranking.error),
    choose: (node: number) => {
      if (query) setChoice({ query, node });
    },
    clearSpotlight: () => setChoice(null),
    retry: () => setRetry((value) => value + 1),
  };
}
