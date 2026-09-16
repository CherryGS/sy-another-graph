import { describe, expect, it } from "vitest";
import { diagnosticValue, ReadIssueCollector } from "./read-issues";

describe("bounded read diagnostics", () => {
  it("retains exact weighted totals and distinct detail counts while bounding samples", () => {
    const issues = new ReadIssueCollector();
    for (let i = 0; i < 103; i++)
      issues.add("reference-endpoints", { fields: { 来源: `source-${i}` } }, 3);
    const [issue] = issues.finish();
    expect(issue.count).toBe(309);
    expect(issue.detailCount).toBe(103);
    expect(issue.details).toHaveLength(20);
    expect(issue.details[19].fields["来源"]).toBe("source-19");
    expect(issue.summary).toContain("309");
  });

  it("preserves diagnostic literals as text and marks truncation without expanding arbitrary payloads", () => {
    const issues = new ReadIssueCollector();
    const fields = { 实际值: "<script>alert(1)</script>", 长值: "x".repeat(1000) };
    issues.add("database-read", { fields });
    fields["实际值"] = "changed";
    const [issue] = issues.finish();
    expect(issue.details[0].fields["实际值"]).toBe("<script>alert(1)</script>");
    expect(issue.details[0].fields["长值"]).toContain("已截断");
    expect(issue.details[0].fields["长值"].length).toBeLessThan(520);
    expect(diagnosticValue({ large: "x".repeat(100000) })).toBe("对象");
    expect(diagnosticValue(undefined)).toBe("（缺失）");
    expect(diagnosticValue("")).toBe("（空字符串）");
  });
});
