import { describe, expect, it, vi } from "vitest";
import {
  createNameExclusionMatcher,
  formatExclusionDraft,
  parseExclusionDraft,
  readExcludedPatterns,
} from "./exclusions";

describe("mention exclusion rules", () => {
  it("mixes normalized literal names and unchanged regex source", () => {
    expect(parseExclusionDraft(" TODO \r\nC++\na.b\n/^\\d{2}$/\n/\\D+/\n/^A{2}$/\n").value).toEqual(
      {
        phrases: ["a.b", "c++", "todo"],
        patterns: ["\\D+", "^A{2}$", "^\\d{2}$"],
      },
    );
    const matches = createNameExclusionMatcher(["C++", "a.b"], ["^\\d{2}$"]);
    expect(["c++", "a.b", "01", "02", "101", "project 01", "axb"].map(matches)).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(createNameExclusionMatcher([], ["\\D"])("01")).toBe(false);
    expect(createNameExclusionMatcher([], ["^A+$"])("aaa")).toBe(true);
  });

  it("round trips legacy slash/backslash phrases without turning them into patterns", () => {
    const phrases = ["/01/", "/path", "\\d", "\\/literal", "ordinary"];
    const patterns = ["^\\d{2}$", "^a/b$", "^ with spaces $"];
    const draft = formatExclusionDraft(phrases, patterns);
    expect(parseExclusionDraft(draft)).toEqual({
      value: { phrases: [...phrases].sort(), patterns: [...patterns].sort() },
      error: null,
    });
    expect(createNameExclusionMatcher(["/01/"], [])("01")).toBe(false);
  });

  it("reports the actual invalid line and never executes patterns during validation", () => {
    const test = vi.spyOn(RegExp.prototype, "test");
    try {
      const pathological = "^(a+)+$";
      expect(parseExclusionDraft(`/${pathological}/`).value?.patterns).toEqual([pathological]);
      expect(
        test.mock.instances.some(
          (regex) => regex instanceof RegExp && regex.source === pathological,
        ),
      ).toBe(false);
    } finally {
      test.mockRestore();
    }
    expect(parseExclusionDraft("Todo\n\n/[/").error).toMatchObject({
      code: "mentions.invalidExclusionPattern",
      params: { line: 3 },
    });
    for (const draft of ["/unfinished", "/foo/g", "//"])
      expect(parseExclusionDraft(draft).error?.code).toBe("mentions.exclusionPatternSyntax");
    expect(parseExclusionDraft("").value).toEqual({ phrases: [], patterns: [] });
  });

  it.each([null, [1], [""], ["["], ["a".repeat(257)], ["a\u0001"], Array(129).fill("a")])(
    "rejects invalid persisted patterns: %j",
    (patterns) => {
      expect(readExcludedPatterns(patterns)).toBeNull();
    },
  );

  it("executes each regex once per unique candidate and skips the literal fast path", () => {
    const matches = createNameExclusionMatcher(["01"], ["^\\d{2}$"]);
    const test = vi.spyOn(RegExp.prototype, "test");
    try {
      expect(["01", "02", "02", "101", "101"].map(matches)).toEqual([
        true,
        true,
        true,
        false,
        false,
      ]);
      expect(test).toHaveBeenCalledTimes(2);
      expect(matches("a".repeat(257))).toBe(false);
      expect(test).toHaveBeenCalledTimes(2);
    } finally {
      test.mockRestore();
    }
  });
});
