import { useEffect, useMemo, useRef, useState } from "react";
import type { CurrentGraph } from "../data/graph-model";
import type { GraphDataset } from "../data/types";
import { MentionClient, EMPTY_MENTION_RESULT, EMPTY_MENTION_SNAPSHOT, type MentionSnapshot } from "../mentions/client";
import { mentionScope } from "../mentions/graph-integration";
import type { MentionMode } from "../mentions/types";

const NO_SELECTION: readonly string[] = [];

export function useMentions(data: GraphDataset | null, graph: CurrentGraph | null, mode: MentionMode, chosenIds: readonly string[]) {
  const [snapshot, setSnapshot] = useState<MentionSnapshot>(EMPTY_MENTION_SNAPSHOT);
  const client = useRef<MentionClient | null>(null);
  const selected = mode === "selected" ? chosenIds : NO_SELECTION;
  const scope = useMemo(() => data && graph ? mentionScope(data, graph) : null, [data, graph]);
  const input = useMemo(() => data?.mentionBlocks && scope
    ? { blocks: data.mentionBlocks, scope, mode, chosenIds: selected }
    : null, [data, scope, mode, selected]);
  useEffect(() => {
    const current = new MentionClient(
      () => new Worker(new URL("../mentions/mentions.worker.ts", import.meta.url), { type: "module" }),
      setSnapshot,
    );
    client.current = current;
    return () => { current.dispose(); client.current = null; };
  }, []);
  useEffect(() => { if (input) client.current?.update(input); }, [input]);
  const current = snapshot.input === input && input !== null;
  return {
    ...snapshot,
    result: current ? snapshot.result : EMPTY_MENTION_RESULT,
    pending: input !== null && (!current || snapshot.pending),
    error: data && !data.mentionBlocks ? "请刷新图谱以读取文本提及所需的正文。" : current ? snapshot.error : "",
    retry: () => client.current?.retry(),
  };
}
