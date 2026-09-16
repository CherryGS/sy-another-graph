import { describe, expect, it } from "vitest";
import { ExclusionPreviewIndex, PREVIEW_PAGE_SIZE } from "./exclusion-preview";
import { MentionIndex } from "./mention-index";

describe("name-only exclusion preview", () => {
  it("deduplicates normalized names and native identities, retaining homonyms and aliases", () => {
    const index = new ExclusionPreviewIndex();
    index.load([
      { id: "a", title: "０１", ial: '{: name="01" alias="Alpha,alpha"}' },
      { id: "b", title: "01", ial: "" },
      { id: "c", title: "101", ial: '{: alias="02"}' },
      { id: "d", title: "---", ial: '{: custom-name="Ignore"}' },
    ]);
    const page = index.preview({ phrases: ["ALPHA"], patterns: ["^\\d{2}$", "alpha"] });
    expect(page).toMatchObject({ matchedNames: 3, matchedNodes: 3, totalRows: 4, filteredRows: 4 });
    expect(page.rows.filter((row) => row.keyword === "01").map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
    expect(page.rows.find((row) => row.keyword === "alpha")!.rule).toEqual({
      kind: "phrase",
      source: "alpha",
    });
    expect(page.rows.some((row) => row.keyword === "101")).toBe(false);
    expect(index.preview({ phrases: [], patterns: [] }).totalRows).toBe(0);
  });

  it("shares name extraction, normalization and matching with the applied vocabulary", () => {
    const blocks = [
      {
        id: "a",
        rootId: "a",
        type: "d",
        title: "０１",
        ial: '{: alias="C++,A&amp;B"}',
        markdown: null,
      },
      { id: "b", rootId: "b", type: "d", title: "101", ial: "", markdown: null },
    ];
    const actual = new MentionIndex();
    actual.replace(blocks);
    const original = actual.progress.keywords;
    const preview = new ExclusionPreviewIndex();
    preview.load(blocks);
    const rules = { phrases: ["C++"], patterns: ["^\\d{2}$", "^A&B$"] };
    const result = preview.preview(rules);
    expect(actual.progress.keywords).toBe(original);
    actual.replace(blocks, rules.phrases, rules.patterns);
    expect(original - actual.progress.keywords).toBe(result.matchedNames);
    expect(actual.progress.keywords).toBe(1);
  });

  it("paginates and searches cached result rows without changing total match counts", () => {
    const index = new ExclusionPreviewIndex();
    index.load(
      Array.from({ length: 120 }, (_, i) => ({ id: `id${i}`, title: `Name ${i}`, ial: "" })),
    );
    const first = index.preview({ phrases: [], patterns: ["^Name"] });
    expect(first.rows).toHaveLength(PREVIEW_PAGE_SIZE);
    expect(index.page(50, "").rows[0].id).toBe("id50");
    expect(index.page(999, "")).toMatchObject({ offset: 100, filteredRows: 120 });
    const found = index.page(50, "ID119");
    expect(found).toMatchObject({
      offset: 0,
      matchedNames: 120,
      matchedNodes: 120,
      totalRows: 120,
      filteredRows: 1,
    });
    expect(found.rows[0].id).toBe("id119");
    expect(index.page(0, "missing").rows).toEqual([]);
    index.load([{ id: "new", title: "New", ial: "" }]);
    expect(index.page(0, "").totalRows).toBe(0);
    expect(index.preview({ phrases: [], patterns: [".*"] }).rows[0].id).toBe("new");
  });
});
