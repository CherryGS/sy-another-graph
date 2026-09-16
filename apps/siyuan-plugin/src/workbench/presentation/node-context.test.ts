import { expect, it } from "vitest";
import { nodeContext } from "./node-context";

it("explains search origin separately from a node's type and source title", () => {
  const node = {
    id: "doc",
    label: "Title",
    index: 0,
    degree: 1,
    color: "#fff",
    notebook: "",
    path: "",
    blockType: "d",
  };
  const context = nodeContext(node, {}, { matches: new Set(), projected: new Map([["doc", 2]]) });
  expect(context.title).toBe("Title");
  expect(context.lines[0]).toBe("文档");
  expect(context.lines[1]).toContain("命中投影：2 个隐藏的命中块");
  expect(
    nodeContext(node, {}, { matches: new Set(["doc"]), projected: new Map() }).lines[1],
  ).toContain("直接命中");
  expect(nodeContext(node, {}, { matches: new Set(), projected: new Map() }).lines[1]).toContain(
    "上级节点",
  );
});

it("keeps distinguishing source context as literal text with a bounded excerpt", () => {
  const context = nodeContext(
    {
      id: "a",
      label: "总结",
      index: 0,
      degree: 1,
      color: "#000000",
      notebook: "book",
      blockType: "p",
      path: "/20260909000000-abcdefg.sy",
      humanPath: "/旅行/北京",
      documentLabel: "北京游记",
      heading: "餐馆 › 午餐",
      content: `<img src='https://invalid.example/pixel'> ${"资料".repeat(300)}`,
    },
    { book: "生活" },
  );
  expect(context.title).toBe("总结");
  expect(context.lines.slice(0, 4)).toEqual([
    "段落 · 生活",
    "北京游记",
    "餐馆 › 午餐",
    "/旅行/北京",
  ]);
  expect(context.lines).not.toContain("/20260909000000-abcdefg.sy");
  expect(context.lines[4]).toContain("<img");
  expect(context.lines[4].length).toBe(361);
});

it.each([undefined, ""])(
  "retains the encoded path fallback when the human path is unavailable (%s)",
  (humanPath) => {
    const context = nodeContext({
      id: "a",
      label: "Document",
      index: 0,
      degree: 0,
      color: "#fff",
      notebook: "",
      path: "/native-id.sy",
      humanPath,
    });
    expect(context.lines).toEqual(["文档", "/native-id.sy"]);
  },
);

it("keeps markup-like human paths and heading ancestry as literal text", () => {
  const context = nodeContext({
    id: "a",
    label: "Same title",
    index: 0,
    degree: 0,
    color: "#fff",
    notebook: "",
    path: "/native-id.sy",
    humanPath: "/Topics/<img src=x onerror=alert(1)>",
    heading: "<h1>Section</h1> › **Subsection**",
  });
  expect(context.lines).toEqual([
    "文档",
    "<h1>Section</h1> › **Subsection**",
    "/Topics/<img src=x onerror=alert(1)>",
  ]);
});

it("distinguishes a document from an identically named heading in the same source path", () => {
  const common = {
    id: "doc",
    label: "Graph Theory",
    index: 0,
    degree: 0,
    color: "#fff",
    notebook: "book",
    path: "/native-id.sy",
    humanPath: "/Research/Graph Theory",
    documentLabel: "Graph Theory",
    content: "Graph Theory",
  };
  const document = nodeContext({ ...common, blockType: "d" }, { book: "Study" });
  const heading = nodeContext(
    {
      ...common,
      id: "heading",
      blockType: "h",
      heading: "Graph Theory",
    },
    { book: "Study" },
  );
  expect(document.title).toBe(heading.title);
  expect(document.lines).toEqual(["文档 · Study", "/Research/Graph Theory"]);
  expect(heading.lines).toEqual(["标题 · Study", "/Research/Graph Theory"]);
});

it.each([
  ["future-type", "future-type"],
  ["constructor", "constructor"],
])("retains an unknown native type label literally (%s)", (blockType, expected) => {
  const context = nodeContext({
    id: "source",
    label: "Source",
    index: 0,
    degree: 0,
    color: "#fff",
    notebook: "",
    path: "",
    blockType,
  });
  expect(context.lines).toEqual([expected]);
});
