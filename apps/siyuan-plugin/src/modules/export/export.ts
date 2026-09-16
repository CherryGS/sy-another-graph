import type { GraphLike } from "../../core/graph/graph-lookups";

export interface ExportFile {
  url: string;
  name: string;
  nodesCount: number;
  edgesCount: number;
}
export interface GraphExportArtifact extends Omit<ExportFile, "url"> {
  json: string;
}
export type GraphExportWriter = (
  artifact: GraphExportArtifact,
  signal?: AbortSignal,
) => Promise<ExportFile>;

export function prepareGraphExport(
  view: GraphLike,
  signal: AbortSignal | undefined,
  write: GraphExportWriter,
): Promise<ExportFile> {
  signal?.throwIfAborted();
  const artifact = {
    name: "atlas-graph-" + Date.now() + "-" + crypto.randomUUID() + ".json",
    nodesCount: view.nodes.length,
    edgesCount: view.edges.length,
    json: JSON.stringify(
      {
        schemaVersion: 1,
        source: "siyuan",
        exportedAt: new Date().toISOString(),
        nodes: view.nodes,
        edges: view.edges,
      },
      null,
      2,
    ),
  };
  signal?.throwIfAborted();
  return write(artifact, signal);
}
