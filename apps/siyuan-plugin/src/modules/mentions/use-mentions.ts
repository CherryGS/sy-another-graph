import { useLocale } from "../../shared/i18n/react";
import { t, text } from "../../shared/i18n/runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CurrentGraph } from "../../core/scope/graph-model";
import type { GraphDataset } from "../../core/graph/types";
import {
  MentionClient,
  EMPTY_MENTION_RESULT,
  EMPTY_MENTION_SNAPSHOT,
  type MentionSnapshot,
} from "./client";
import { mentionScope } from "./graph-integration";
import type { MentionMode } from "./types";

const NO_SELECTION: readonly string[] = [];

export function useMentions(
  data: GraphDataset | null,
  graph: CurrentGraph | null,
  mode: MentionMode,
  chosenIds: readonly string[],
  excludedPhrases: readonly string[],
) {
  useLocale();
  const [snapshot, setSnapshot] = useState<MentionSnapshot>(EMPTY_MENTION_SNAPSHOT);
  const client = useRef<MentionClient | null>(null);
  const selected = mode === "selected" ? chosenIds : NO_SELECTION;
  const scope = useMemo(() => (data && graph ? mentionScope(data, graph) : null), [data, graph]);
  const input = useMemo(
    () =>
      data?.mentionBlocks && scope
        ? { blocks: data.mentionBlocks, scope, mode, chosenIds: selected, excludedPhrases }
        : null,
    [data, scope, mode, selected, excludedPhrases],
  );
  useEffect(() => {
    const current = new MentionClient(
      () => new Worker(new URL("./mentions.worker.ts", import.meta.url), { type: "module" }),
      setSnapshot,
    );
    client.current = current;
    return () => {
      current.dispose();
      client.current = null;
    };
  }, []);
  useEffect(() => {
    if (input) client.current?.update(input);
  }, [input]);
  const current = snapshot.input === input && input !== null;
  return {
    ...snapshot,
    result: current ? snapshot.result : EMPTY_MENTION_RESULT,
    pending: input !== null && (!current || snapshot.pending),
    error:
      data && !data.mentionBlocks
        ? t("text.refreshTheGraphToReadTheTextNeeded")
        : current
          ? text(snapshot.error)
          : "",
    retry: () => client.current?.retry(),
  };
}
