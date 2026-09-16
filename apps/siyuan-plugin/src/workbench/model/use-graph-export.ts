import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphDataset } from "../../core/graph/types";
import type { GraphView } from "../../core/scope/graph-model";
import type { ExportFile } from "../../modules/export/export";
import { presentNodes } from "../presentation/present-nodes";
import { userMessage } from "../presentation/errors";
import { useWorkbenchServices } from "./services";

export function useGraphExport(
  data: GraphDataset | null,
  view: GraphView,
  refreshing: boolean,
  mentionsPending: boolean,
  notify: (message: string) => void,
) {
  const { exportGraph: write } = useWorkbenchServices();
  const input = useMemo(
    () => ({ data, view, refreshing, mentionsPending }),
    [data, view, refreshing, mentionsPending],
  );
  const [state, setState] = useState<{
    input: typeof input;
    file: ExportFile | null;
    pending: boolean;
  } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
      abort.current?.abort();
    },
    [input],
  );

  const exportGraph = async () => {
    if (!data || refreshing || (state?.input === input && state.pending)) return;
    if (mentionsPending) {
      notify("文本提及仍在计算，完成后可导出包含提及关系的图谱。");
      return;
    }
    const request = ++sequence.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ input, pending: true, file: null });
    try {
      const file = await write(
        { nodes: presentNodes(view, data.notebooks), edges: view.edges },
        controller.signal,
      );
      if (request !== sequence.current || controller.signal.aborted) return;
      setState({ input, pending: false, file });
      notify("JSON 文件已生成，点击「下载 JSON」保存");
    } catch (failure) {
      if (request !== sequence.current || controller.signal.aborted) return;
      setState({ input, pending: false, file: null });
      notify(userMessage(failure));
    }
  };
  return {
    exportGraph,
    exporting: state?.input === input && state.pending,
    exportFile: state?.input === input ? state.file : null,
    dismissExport: () => setState(null),
  };
}
