import { useEffect, useMemo, useRef, useState } from "react";
import { text } from "../../shared/i18n/runtime";
import { useLocale } from "../../shared/i18n/react";
import type { MentionBlock } from "./types";
import type { MentionExclusions } from "./exclusions";
import { EMPTY_EXCLUSION_PREVIEW, ExclusionPreviewClient } from "./exclusion-preview-client";

export function useExclusionPreview(
  blocks: readonly MentionBlock[] | undefined,
  rules: MentionExclusions | null,
) {
  useLocale();
  const [snapshot, setSnapshot] = useState(EMPTY_EXCLUSION_PREVIEW);
  const [retry, setRetry] = useState(0);
  const client = useRef<ExclusionPreviewClient | null>(null);
  const input = useMemo(
    () =>
      blocks && rules && (rules.phrases.length || rules.patterns.length) ? { blocks, rules } : null,
    [blocks, rules],
  );
  useEffect(() => {
    const current = new ExclusionPreviewClient(
      () =>
        new Worker(new URL("./exclusion-preview.worker.ts", import.meta.url), { type: "module" }),
      setSnapshot,
    );
    client.current = current;
    return () => {
      current.dispose();
      client.current = null;
    };
  }, []);
  useEffect(() => {
    if (!input) return;
    const timer = setTimeout(() => {
      void client.current?.update(input);
    }, 400);
    return () => {
      clearTimeout(timer);
      client.current?.cancel();
    };
  }, [input, retry]);
  const current = !!input && snapshot.input === input;
  return {
    enabled: !!input,
    pending: !!input && (!current || snapshot.pending),
    page: current ? snapshot.page : null,
    error: current ? text(snapshot.error) : "",
    requestPage: (offset: number, query: string) => client.current?.page(offset, query),
    retry: () => setRetry((value) => value + 1),
  };
}
