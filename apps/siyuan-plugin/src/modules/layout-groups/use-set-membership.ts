import { useEffect, useMemo, useState } from "react";
import { failureOf, type Failure } from "../../core/diagnostics/message";
import type { GraphNode } from "../../core/graph/types";
import { useLocale } from "../../shared/i18n/react";
import { text } from "../../shared/i18n/runtime";
import type { LayoutSet } from "./model";
import type { SetMembership } from "./matcher";
import { resolveSetMembership } from "./client";

export function useSetMembership(
  nodes: readonly GraphNode[],
  sets: readonly LayoutSet[],
  enabled: boolean,
) {
  useLocale();
  const [retry, setRetry] = useState(0);
  // Names and unrelated layout controls do not invalidate membership.
  const signature = useMemo(
    () => JSON.stringify(sets.map(({ id, enabled, rules }) => ({ id, name: "", enabled, rules }))),
    [sets],
  );
  const input = useMemo(
    () => (enabled ? { nodes, sets: JSON.parse(signature) as LayoutSet[], retry } : null),
    [nodes, signature, enabled, retry],
  );
  const [snapshot, setSnapshot] = useState<{
    input: typeof input;
    result?: SetMembership;
    error?: Failure;
  } | null>(null);
  useEffect(() => {
    if (!input) {
      // eslint-disable-next-line react/set-state-in-effect -- Release the old source and worker results when the mode is inactive.
      setSnapshot(null);
      return;
    }
    const controller = new AbortController();
    void resolveSetMembership(
      input.nodes,
      input.sets,
      controller.signal,
      () => new Worker(new URL("./layout-groups.worker.ts", import.meta.url), { type: "module" }),
    ).then(
      (result) => {
        if (!controller.signal.aborted) setSnapshot({ input, result });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setSnapshot({ input, error: failureOf(error) });
      },
    );
    return () => controller.abort();
  }, [input]);
  const current = input && snapshot?.input === input ? snapshot : null;
  return {
    result: current?.result,
    error: current?.error ? text(current.error) : undefined,
    pending: !!input && !current,
    retry: () => setRetry((value) => value + 1),
  };
}
