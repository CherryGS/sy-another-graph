import { useEffect, useMemo, useState } from "react";
import { failureOf, type Failure } from "../../core/diagnostics/message";
import type { GraphDataset } from "../../core/graph/types";
import { useLocale } from "../../shared/i18n/react";
import { text } from "../../shared/i18n/runtime";
import { resolveContentExclusions } from "./client";
import type { ContentExclusionRule } from "./rules";
import type { ContentExclusionResult } from "./matcher";
import type { ExclusionContext } from "./pipeline-model";

const EMPTY_RESULT: ContentExclusionResult = { ids: [], matchedRoots: 0, documents: 0, blocks: 0 };

/** Separate instances isolate editable previews from the applied source boundary. */
export function useContentExclusions(
  data: GraphDataset | null,
  rules: readonly ContentExclusionRule[] | null,
  delay = 0,
  context?: ExclusionContext,
) {
  useLocale();
  const [retry, setRetry] = useState(0);
  const input = useMemo(
    () =>
      data && rules && (rules.length || context?.pipeline.enabled.empty)
        ? { data, rules, context, retry, token: {} }
        : null,
    [data, rules, context, retry],
  );
  const [snapshot, setSnapshot] = useState<{
    token: object;
    result: ContentExclusionResult | null;
    error: Failure;
  } | null>(null);
  useEffect(() => {
    if (!input) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void resolveContentExclusions(
        input.data,
        input.rules,
        controller.signal,
        () =>
          new Worker(new URL("./content-exclusions.worker.ts", import.meta.url), {
            type: "module",
          }),
        input.context,
      ).then(
        (result) => {
          if (!controller.signal.aborted) setSnapshot({ token: input.token, result, error: "" });
        },
        (error: unknown) => {
          if (!controller.signal.aborted)
            setSnapshot({ token: input.token, result: null, error: failureOf(error) });
        },
      );
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, delay]);
  const current = input && snapshot?.token === input.token ? snapshot : null;
  const result = input ? (current?.result ?? null) : EMPTY_RESULT;
  const excludedIds = useMemo(() => (result ? new Set(result.ids) : null), [result]);
  return {
    result,
    excludedIds,
    pending: !!input && !current,
    error: current ? text(current.error) : "",
    retry: () => setRetry((value) => value + 1),
  };
}
