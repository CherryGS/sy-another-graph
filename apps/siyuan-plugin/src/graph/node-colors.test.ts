import { describe, expect, it } from "vitest";
import { NODE_TYPE_COLORS, nodeColor, nodeTypeColor } from "./node-colors";

const node = {
  id: "a", index: 0, label: "Node",
  notebook: "book",
  path: "/root/concepts.sy",
  degree: 4,
  color: "#abcdef",
};

describe("node colors", () => {
  it("assigns stable type colors across filtering, notebooks, and degree changes", () => {
    expect(new Set(Object.values(NODE_TYPE_COLORS)).size).toBe(Object.keys(NODE_TYPE_COLORS).length);
    expect(nodeColor({ ...node, blockType: "p" }, "type")).toBe(NODE_TYPE_COLORS.p);
    expect(nodeColor({ ...node, blockType: "h" }, "type")).toBe(NODE_TYPE_COLORS.h);
    expect(nodeColor({ ...node, blockType: "p", notebook: "other", degree: 2000 }, "type")).toBe(NODE_TYPE_COLORS.p);
    expect(nodeColor({ ...node, entity: "database", blockType: "p" }, "type")).toBe(NODE_TYPE_COLORS.database);
    expect(nodeColor({ ...node, entity: "database-item" }, "type")).toBe(NODE_TYPE_COLORS["database-item"]);
    expect(nodeTypeColor("future-type")).toMatch(/^#[\da-f]{6}$/);
    expect(nodeTypeColor("constructor")).toMatch(/^#[\da-f]{6}$/);
  });
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
