import { describe, expect, it } from "vitest";
import { nodeColor } from "./node-colors";

const node = {
  notebook: "book",
  path: "/root/concepts.sy",
  degree: 4,
  color: "#abcdef",
};

describe("node colors", () => {
  it("groups descendants by the first branch below their root", () => {
    const concept = nodeColor(node, "branch");
    expect(
      nodeColor({ ...node, path: "/root/concepts/nested/note.sy" }, "branch"),
    ).toBe(concept);
    expect(
      nodeColor({ ...node, path: "/root/projects.sy" }, "branch"),
    ).not.toBe(concept);
    expect(nodeColor({ ...node, path: "" }, "branch")).toBe(node.color);
  });

  it("preserves notebook colors and uses a bounded degree scale independent of visible nodes", () => {
    expect(nodeColor(node, "notebook")).toBe(node.color);
    expect(nodeColor({ ...node, degree: 0 }, "degree")).toBe("#6586c9");
    expect(nodeColor({ ...node, degree: 255 }, "degree")).toBe("#ed879a");
    expect(nodeColor({ ...node, degree: 100_000 }, "degree")).toBe("#ed879a");
    expect(nodeColor({ ...node, degree: NaN }, "degree")).toBe("#6586c9");
    expect(nodeColor(node, "degree")).not.toBe(
      nodeColor({ ...node, degree: 30 }, "degree"),
    );
  });
});
