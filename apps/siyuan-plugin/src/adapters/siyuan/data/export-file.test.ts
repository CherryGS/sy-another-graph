import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareGraphExport as prepare } from "../../../modules/export/export";
import { writeGraphFile } from "./export-file";
const prepareGraphExport = (view: Parameters<typeof prepare>[0], signal?: AbortSignal) =>
  prepare(view, signal, writeGraphFile);
import type { GraphNode } from "../../../core/graph/types";

afterEach(() => vi.unstubAllGlobals());

describe("SiYuan JSON export", () => {
  it("uploads the selected view and accepts its exact local download path", async () => {
    const nodes: GraphNode[] = [
      {
        id: "doc",
        index: 90001,
        label: "Graph",
        notebook: "book",
        path: "/doc.sy",
      },
    ];
    const request = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.credentials).toBe("same-origin");
      expect(options.method).toBe("POST");
      const form = options.body as FormData;
      expect(form.get("type")).toBe("application/json");
      const file = form.get("file") as File;
      expect(file.type).toBe("application/json");
      expect(JSON.parse(await file.text())).toMatchObject({
        schemaVersion: 1,
        source: "siyuan",
        nodes,
        edges: [],
      });
      return Response.json({
        code: 0,
        data: { file: `/export/file-${file.name}` },
      });
    });
    vi.stubGlobal("fetch", request);
    const result = await prepareGraphExport({ nodes, edges: [] });
    expect(result.url).toBe(`/export/file-${result.name}`);
    expect(result.nodesCount).toBe(1);
    expect(result.edgesCount).toBe(0);
    expect(request.mock.calls[0]?.[0]).toBe("/api/export/exportAsFile");
  });

  it.each([
    "https://example.com/export.json",
    "/export/../conf/conf.json",
    "/export/file-other.json",
    null,
  ])("rejects an unexpected download address: %s", async (file) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ code: 0, data: { file } })),
    );
    await expect(prepareGraphExport({ nodes: [], edges: [] })).rejects.toThrow(
      "text.siyuanReturnedAnInvalidJsonDownloadUrl",
    );
  });

  it("reports an HTTP failure without reporting export success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unauthorized", { status: 401 })),
    );
    await expect(prepareGraphExport({ nodes: [], edges: [] })).rejects.toMatchObject({
      detail: { code: "text.jsonExportFailedHttpValue", params: { p0: 401 } },
    });
  });

  it("reports SiYuan application errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ code: -1, msg: "Storage unavailable" })),
    );
    await expect(prepareGraphExport({ nodes: [], edges: [] })).rejects.toThrow(
      "Storage unavailable",
    );
  });
});
