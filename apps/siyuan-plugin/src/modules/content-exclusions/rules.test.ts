import { describe, expect, it } from "vitest";
import {
  contentExclusionRules,
  formatContentExclusionDraft,
  parseContentExclusionDraft,
  readContentExclusions,
  splitContentExclusions,
} from "./rules";

const ID = "20260921000000-abc1234";

describe("content exclusion grammar and persistence", () => {
  it("distinguishes IDs, literal title substrings and case-preserved regex in both scopes", () => {
    const parsed = parseContentExclusionDraft(
      `${ID}\n 日记 \nＰＲＯＪＥＣＴ\n/\\D+/\n/^\\d{4}-\\d{2}$/`,
      "document",
    );
    expect(parsed.error).toBeNull();
    expect(parsed.value).toEqual(
      expect.arrayContaining([
        { kind: "id", value: ID, scope: "document" },
        { kind: "text", value: "日记", scope: "document" },
        { kind: "text", value: "project", scope: "document" },
        { kind: "regex", value: "\\D+", scope: "document" },
        { kind: "regex", value: "^\\d{4}-\\d{2}$", scope: "document" },
      ]),
    );
    expect(
      parseContentExclusionDraft(
        formatContentExclusionDraft(parsed.value!, "document"),
        "document",
      ),
    ).toEqual(parsed);
    expect(parseContentExclusionDraft(`${ID}, ${ID}`, "subtree").value).toEqual([
      { kind: "id", value: ID, scope: "subtree" },
    ]);
  });

  it("round trips leading slash/backslash literals without making them regex", () => {
    const rules = readContentExclusions([
      { kind: "text", value: "/archive/", scope: "document" },
      { kind: "text", value: "\\draft", scope: "document" },
    ])!;
    expect(
      parseContentExclusionDraft(formatContentExclusionDraft(rules, "document"), "document").value,
    ).toEqual(rules);
  });

  it("retains old subtree IDs and keeps the same ID's independent document rule", () => {
    const rules = contentExclusionRules([ID, ID], [{ kind: "id", value: ID, scope: "document" }]);
    expect(rules).toHaveLength(2);
    expect(splitContentExclusions(rules)).toEqual({
      excludeIds: [ID],
      exclusionRules: [{ kind: "id", value: ID, scope: "document" }],
    });
  });

  it("rejects invalid expressions with line numbers and bounds both groups together", () => {
    expect(parseContentExclusionDraft("valid\n/[/", "subtree").error).toMatchObject({
      code: "mentions.invalidExclusionPattern",
      params: { line: 2 },
    });
    expect(parseContentExclusionDraft("/pattern/i", "subtree").value).toBeNull();
    expect(parseContentExclusionDraft(`${ID}, ${ID}\n/[/`, "subtree").error).toMatchObject({
      params: { line: 2 },
    });
    expect(
      readContentExclusions(Array(129).fill({ kind: "regex", value: "a", scope: "document" })),
    ).toBeNull();
    expect(
      readContentExclusions(Array(2001).fill({ kind: "text", value: "a", scope: "document" })),
    ).toBeNull();
    for (const rule of [
      { kind: "id", value: "bad", scope: "subtree" },
      { kind: "text", value: "", scope: "document" },
      { kind: "text", value: "a".repeat(257), scope: "document" },
      { kind: "text", value: "bad\u0000text", scope: "document" },
      { kind: "regex", value: "[", scope: "document" },
      { kind: "regex", value: "", scope: "document" },
      { kind: "text", value: "title", scope: "unknown" },
    ])
      expect(readContentExclusions([rule])).toBeNull();
  });
});
