import { describe, expect, it } from "vitest";
import { hasExplorationNotice } from "./exploration-result";

describe("semantic exploration notices", () => {
  it("decides notice visibility without looking at translated text", () => {
    expect(hasExplorationNotice(null)).toBe(false);
    expect(
      hasExplorationNotice({ kind: "neighborhood", depth: 2, direction: "both", truncated: false }),
    ).toBe(false);
    expect(
      hasExplorationNotice({ kind: "neighborhood", depth: 2, direction: "both", truncated: true }),
    ).toBe(true);
    expect(hasExplorationNotice({ kind: "path", steps: 0 })).toBe(true);
  });
});
