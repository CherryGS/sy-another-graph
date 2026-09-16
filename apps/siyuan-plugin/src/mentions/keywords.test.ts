import { describe, expect, it } from "vitest";
import { normalizeExcludedPhrases, readExcludedPhrases } from "./keywords";

describe("excluded mention phrases", () => {
  it("normalizes whole phrases, preserving leading zeros and literal punctuation", () => {
    expect(
      normalizeExcludedPhrases([
        " ０１ ",
        "01",
        " GRAPH  THEORY ",
        "Graph\tTheory",
        "Alpha,Beta",
        "\u200B",
        "",
      ]),
    ).toEqual(["01", "alpha,beta", "graph theory"]);
    expect(readExcludedPhrases(["Cafe\u0301", "CAFÉ"])).toEqual(["café"]);
    expect(readExcludedPhrases(["", "  "])).toEqual([]);
  });

  it.each([
    null,
    undefined,
    "01",
    [1],
    ["a".repeat(257)],
    ["bad\u0001phrase"],
    ["bad\u0081phrase"],
    ["\uFFFC"],
    Array(2_001).fill("01"),
  ])("rejects malformed or oversized exclusions: %j", (value) => {
    expect(readExcludedPhrases(value)).toBeNull();
  });
});
