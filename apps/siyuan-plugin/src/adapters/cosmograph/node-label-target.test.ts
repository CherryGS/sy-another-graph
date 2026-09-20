import { describe, expect, it } from "vitest";
import { labelNodeId, nodeLabelClass } from "./node-label-target";

function target({ id, classes }: { id?: string; classes?: string[] } = {}): Element {
  const label = { classList: classes ?? [], getAttribute: () => id ?? null };
  return {
    closest: (selector: string) =>
      selector === "[data-graph-node-id]"
        ? id !== undefined
          ? label
          : null
        : classes !== undefined
          ? label
          : null,
  } as unknown as Element;
}

describe("graph label context targets", () => {
  it("uses stable identities for same-title labels even after numeric indices change", () => {
    const first = target({ classes: ["ag-graph-label", nodeLabelClass("first")] });
    const second = target({ classes: ["ag-graph-label", nodeLabelClass("second")] });
    const reordered = new Map([
      ["second", 0],
      ["first", 1],
    ]);
    expect(labelNodeId(first, reordered)).toBe("first");
    expect(labelNodeId(second, reordered)).toBe("second");
  });

  it("rejects a removed label instead of falling through to the point under it", () => {
    const displayed = new Map([["replacement", 0]]);
    expect(labelNodeId(target({ id: "removed" }), displayed)).toBeNull();
    expect(labelNodeId(target({ classes: [nodeLabelClass("removed")] }), displayed)).toBeNull();
  });

  it("preserves exact logical IDs in both label layers without embedding whitespace", () => {
    const id = "av:database/条目 %";
    const token = nodeLabelClass(id);
    const displayed = new Map([[id, 0]]);
    expect(token).not.toMatch(/\s/);
    expect(labelNodeId(target({ classes: [token] }), displayed)).toBe(id);
    expect(labelNodeId(target({ id }), displayed)).toBe(id);
  });

  it("distinguishes canvas targets from unrelated or malformed labels", () => {
    const displayed = new Map([["node", 0]]);
    expect(labelNodeId(target(), displayed)).toBeUndefined();
    expect(labelNodeId(null, displayed)).toBeUndefined();
    expect(labelNodeId(target({ classes: ["cluster-label"] }), displayed)).toBeNull();
    expect(labelNodeId(target({ classes: ["ag-node-id--%invalid"] }), displayed)).toBeNull();
  });
});
