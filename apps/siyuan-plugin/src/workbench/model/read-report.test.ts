import { beforeEach as beforeLocaleTest, describe, expect, it } from "vitest";
import { setLocale } from "../../shared/i18n/runtime";
beforeLocaleTest(() => setLocale("zh-CN"));

import { ReadIssueCollector } from "../../core/diagnostics/read-issues";
import type { GraphDataset } from "../../core/graph/types";
import { readReport } from "./read-report";

describe("copyable read report", () => {
  it("includes the snapshot, exact failure location and bounded-detail disclosure without raw note content", () => {
    const issues = new ReadIssueCollector();
    issues.add("database-read", {
      fields: {
        接口: "/api/av/getAttributeView",
        "数据库 ID": "db-1",
        位置: "av.keyValues[0].key.id",
        实际值: "（空字符串）",
      },
    });
    const data: GraphDataset = {
      source: "siyuan",
      notebooks: [],
      skippedReferences: 0,
      loadedAt: "2026-09-13T00:00:00Z",
      loadMs: 123.4,
      nodes: [
        {
          id: "x",
          index: 0,
          label: "x",
          notebook: "book",
          path: "/x.sy",
          content: "private note body",
        },
      ],
      edges: [],
      referenceCount: 8,
      warnings: issues.finish(),
    };
    const report = readReport(data);
    expect(report).toContain(data.loadedAt);
    expect(report).toContain("av.keyValues[0].key.id");
    expect(report).toContain("/api/av/getAttributeView");
    expect(report).toContain("1 / 1");
    expect(report).toContain("每类最多保留 20 条");
    expect(report).not.toContain("private note body");
  });
});
