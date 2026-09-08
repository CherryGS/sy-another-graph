import type { GraphEdge, GraphNode } from "./types";

export interface ExportFile {
  url: string;
  name: string;
  nodesCount: number;
  edgesCount: number;
}

export async function prepareGraphExport(
  view: { nodes: GraphNode[]; edges: GraphEdge[] },
  signal?: AbortSignal,
): Promise<ExportFile> {
  const name = `atlas-graph-${Date.now()}-${crypto.randomUUID()}.json`;
  const form = new FormData();
  form.append(
    "file",
    new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 1,
            source: "siyuan",
            exportedAt: new Date().toISOString(),
            ...view,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
    name,
  );
  form.append("type", "application/json");
  const response = await fetch("/api/export/exportAsFile", {
    method: "POST",
    credentials: "same-origin",
    body: form,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      : AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`JSON 导出失败（HTTP ${response.status}）`);
  const result = (await response.json()) as {
    code?: number;
    msg?: string;
    data?: { file?: unknown };
  };
  if (result.code !== 0)
    throw new Error(result.msg || "思源未能生成 JSON 导出文件");
  // The SiYuan endpoint prefixes uploaded basenames with "file-". Accept only
  // this exact local export, never a server-supplied external or arbitrary URL.
  if (result.data?.file !== `/export/file-${name}`)
    throw new Error("思源返回了无效的 JSON 下载地址");
  return {
    url: result.data.file,
    name,
    nodesCount: view.nodes.length,
    edgesCount: view.edges.length,
  };
}
