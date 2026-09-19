import { beforeEach as beforeLocaleTest, describe, expect, it } from "vitest";
import { setLocale } from "../../shared/i18n/runtime";
beforeLocaleTest(() => setLocale("zh-CN"));

import { ReadIssueCollector } from "../../core/diagnostics/read-issues";
import type { GraphDataset } from "../../core/graph/types";
import { readReport } from "./read-report";

describe("copyable read report", () => {
  it("explains duplicate index rows in both languages without presenting the chosen row as authoritative", () => {
    const issues = new ReadIssueCollector();
    issues.add(
      "duplicate-blocks",
      {
        openBlockId: "block",
        fields: {
          "text.sourceBlockId": "block",
          "read.documentId": "document",
          "read.duplicateBlockRows": "3",
          "read.chosenBlockRow": "9007199254740993",
        },
      },
      2,
    );
    const data: GraphDataset = {
      source: "siyuan",
      nodes: [],
      edges: [],
      notebooks: [],
      skippedReferences: 0,
      referenceCount: 0,
      loadMs: 1,
      loadedAt: "2026-09-19T00:00:00Z",
      warnings: issues.finish(),
    };
    const chinese = readReport(data);
    expect(chinese).toContain("已按块 ID 合并 2 条多余索引记录");
    expect(chinese).toContain("采用的索引行号: 9007199254740993");
    expect(chinese).toContain("不保证它就是最新正文");
    setLocale("en");
    const english = readReport(data);
    expect(english).toContain("Merged 2 extra index entries");
    expect(english).toContain("This does not guarantee the newest content");
    expect(english).not.toContain("read.chosenBlockRow");
  });
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
