import { message as msg, MessageError } from "../../../core/diagnostics/message";
import type { ExportFile, GraphExportArtifact } from "../../../modules/export/export";

export async function writeGraphFile(
  artifact: GraphExportArtifact,
  signal?: AbortSignal,
): Promise<ExportFile> {
  const { name } = artifact;
  const form = new FormData();
  form.append("file", new Blob([artifact.json], { type: "application/json" }), name);
  form.append("type", "application/json");
  const response = await fetch("/api/export/exportAsFile", {
    method: "POST",
    credentials: "same-origin",
    body: form,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      : AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new MessageError(msg("text.jsonExportFailedHttpValue", { p0: response.status }));
  const result = (await response.json()) as {
    code?: number;
    msg?: string;
    data?: { file?: unknown };
  };
  if (result.code !== 0)
    throw new MessageError(result.msg || msg("text.siyuanCouldNotGenerateTheJsonExport"));
  // The SiYuan endpoint prefixes uploaded basenames with "file-". Accept only
  // this exact local export, never a server-supplied external or arbitrary URL.
  if (result.data?.file !== `/export/file-${name}`)
    throw new MessageError(msg("text.siyuanReturnedAnInvalidJsonDownloadUrl"));
  return {
    url: result.data.file,
    name,
    nodesCount: artifact.nodesCount,
    edgesCount: artifact.edgesCount,
  };
}
