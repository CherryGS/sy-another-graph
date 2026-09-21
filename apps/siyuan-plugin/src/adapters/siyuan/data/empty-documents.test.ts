import { describe, expect, it } from "vitest";
import { emptyDocumentIds } from "./empty-documents";
import { normalizeGraph, type BlockRow } from "./source";

const row = (id: string, type: string, root_id = id, content = "", markdown = ""): BlockRow => ({
  id,
  type,
  root_id,
  content,
  markdown,
  box: "book",
  path: `/${root_id}.sy`,
});
describe("document body emptiness", () => {
  it("ignores document titles, child documents, blank paragraphs and empty structural containers", () => {
    const rows = [
      row("parent", "d", "parent", "Category"),
      row("child", "d", "child", "Child"),
      row("child-body", "p", "child", "Text", "Text"),
      row("blank", "p", "parent", " \n\u200b", " \n"),
      row("list", "l", "parent"),
      row("item", "i", "parent"),
    ];
    expect([...emptyDocumentIds(rows)]).toEqual(["parent"]);
    const data = normalizeGraph(rows, []);
    expect(data.nodes.find((node) => node.id === "parent")?.emptyDocument).toBe(true);
    expect(data.nodes.find((node) => node.id === "child")?.emptyDocument).toBe(false);
  });
  it.each(["av", "c", "m", "html", "iframe", "widget", "video", "audio", "new-unknown-type"])(
    "treats %s as content even without plain text",
    (type) => {
      expect(emptyDocumentIds([row("doc", "d"), row("body", type, "doc")]).size).toBe(0);
    },
  );
  it.each(["![](assets/photo.png)", "[attachment](assets/file.pdf)", "((20260922000000-abcdefg))"])(
    "keeps markup-only content: %s",
    (markdown) => {
      expect(emptyDocumentIds([row("doc", "d"), row("body", "p", "doc", "", markdown)]).size).toBe(
        0,
      );
    },
  );
  it("keeps unknown paragraph content when markdown was unavailable", () => {
    expect(
      emptyDocumentIds([row("doc", "d"), { ...row("body", "p", "doc"), markdown: undefined }]).size,
    ).toBe(0);
  });
});
