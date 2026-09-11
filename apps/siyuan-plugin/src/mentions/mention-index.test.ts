import { describe, expect, it } from "vitest";
import { MentionIndex } from "./mention-index";
import { KeywordMatcher } from "./matcher";
import { nativeNames, normalizeKeyword, ordinaryProse } from "./prose";
import type { MentionBlock, MentionScope } from "./types";

const controller = () => new AbortController();
const doc = (id: string, title: string, ial = ""): MentionBlock => ({ id, rootId: id, type: "d", title, ial, markdown: null });
const paragraph = (id: string, rootId: string, markdown: string, ial = ""): MentionBlock => ({ id, rootId, type: "p", title: "", ial, markdown });
const scopeOf = (blocks: MentionBlock[]): MentionScope => ({ entries: blocks.map((block, index) => ({ id: block.id, displayId: block.id, index })), explicitPairs: [] });
async function indexOf(blocks: MentionBlock[], limits = {}) {
  const index = new MentionIndex(limits);
  index.replace(blocks);
  await index.warm(() => {}, controller().signal);
  return index;
}

describe("ordinary source prose and vocabulary", () => {
  it("keeps formatted prose but excludes native refs, Markdown links, code, URLs, attributes, and raw HTML", () => {
    const prose = ordinaryProse('Graph **Theory** and art. `InlineSecret` [LinkSecret](https://example.test) ((20260822181032-6spbotb "NativeSecret")) https://example.test/UrlSecret {: name="AttributeSecret"}\n\n```ts\nCodeSecret\n```\n\n<span title="AttributeSecret">HtmlSecret</span> VisibleAgain');
    expect(prose).toContain("Graph Theory and art.");
    expect(prose).toContain("VisibleAgain");
    for (const secret of ["InlineSecret", "LinkSecret", "NativeSecret", "UrlSecret", "AttributeSecret", "CodeSecret", "HtmlSecret"])
      expect(prose).not.toContain(secret);
  });

  it("preserves hard boundaries around excluded syntax and between paragraphs", () => {
    const prose = ordinaryProse("Graph `code` Theory\n\nGraph\n\nTheory");
    expect(new KeywordMatcher(["graph theory"]).scan(prose, 100).hits).toHaveLength(0);
    expect(ordinaryProse("A&amp;B and &lt;literal&gt;")).toContain("A&B and <literal>");
  });

  it("reads native names and aliases without mistaking custom attributes for names", () => {
    expect(nativeNames("Document", '{: custom-name="Ignore" name="A&amp;B" alias="Other,With\\,Comma,&#x56;alue"}'))
      .toEqual(["Document", "A&B", "Other", "With,Comma", "Value"]);
  });

  it("matches whole Latin words and embedded Chinese names with original Unicode offsets", () => {
    const text = ordinaryProse("part art ART article 学习图论与路径 ＡＲＴ Cafe\u0301");
    const matcher = new KeywordMatcher(["art", "图论", normalizeKeyword("Café")]);
    expect(matcher.scan(text, 100).hits.map(hit => text.slice(hit.start, hit.end)))
      .toEqual(["art", "ART", "图论", "ＡＲＴ", "Cafe\u0301"]);
  });
});

describe("cached text mention graph", () => {
  it("keeps source paragraphs and counts occurrences, with explicit edges taking precedence", async () => {
    const blocks = [doc("a", "Alpha"), doc("b", "Beta"), paragraph("p", "a", "Beta and **Beta**. Alpha ((20260822181032-6spbotb 'Beta'))")];
    const index = await indexOf(blocks);
    const scope = scopeOf(blocks);
    const all = await index.query(scope, "all", [], controller().signal);
    expect(all.edges).toHaveLength(1);
    expect(all.edges[0]).toMatchObject({ source: 2, target: 1, kind: "text-mention", weight: 2,
      provenance: [{ sourceId: "p", targetId: "b", weight: 2, mention: { matched: "Beta", candidates: 1 } }] });
    const evidence = all.edges[0].provenance![0].mention!;
    expect(evidence.excerpt.slice(evidence.start, evidence.end)).toBe("Beta");
    expect((await index.query({ ...scope, explicitPairs: [[2, 1]] }, "all", [], controller().signal)).edges).toEqual([]);
  });

  it("supports selected documents' own prose, incoming mentions, multi-selection union, and off", async () => {
    const blocks = [doc("a", "Alpha"), doc("b", "Beta"), doc("c", "Gamma"), paragraph("pa", "a", "Beta"), paragraph("pc", "c", "Alpha")];
    const index = await indexOf(blocks);
    const scope = scopeOf(blocks);
    const all = await index.query(scope, "all", [], controller().signal);
    expect(all.edges).toHaveLength(2);
    expect((await index.query(scope, "selected", ["a"], controller().signal)).edges).toEqual(all.edges);
    expect((await index.query(scope, "selected", ["b", "c"], controller().signal)).edges).toEqual(all.edges);
    expect((await index.query(scope, "selected", ["b"], controller().signal)).edges).toHaveLength(1);
    expect((await index.query(scope, "selected", [], controller().signal)).edges).toEqual([]);
    expect((await index.query(scope, "off", ["a"], controller().signal)).edges).toEqual([]);
    expect(index.progress.scanned).toBe(2);
  });

  it("filters both source and target before resolving ambiguous and overlapping names", async () => {
    const blocks = [doc("a", "Source"), doc("b", "Graph"), doc("c", "Graph Theory"), doc("d", "Graph Theory"), paragraph("p", "a", "Graph Theory")];
    const index = await indexOf(blocks);
    const scope = scopeOf(blocks);
    const full = await index.query(scope, "all", [], controller().signal);
    expect(full.edges.map(edge => edge.target)).toEqual([2, 3]);
    expect(full.ambiguousEdges).toBe(2);
    expect(full.edges[0].provenance![0].mention!.candidates).toBe(2);
    const smaller = { ...scope, entries: scope.entries.filter(entry => !["c", "d"].includes(entry.id)) };
    const short = await index.query(smaller, "all", [], controller().signal);
    expect(short.edges.map(edge => edge.target)).toEqual([1]);
    expect(short.edges[0].provenance![0].mention!.matched).toBe("Graph");
    expect((await index.query({ ...scope, entries: scope.entries.filter(entry => entry.id !== "p") }, "all", [], controller().signal)).edges).toEqual([]);
    // Selection filters the already resolved scope matches; it does not favor
    // a selected short name over an unselected longer name in the same scope.
    expect((await index.query(scope, "selected", ["b"], controller().signal)).edges).toEqual([]);
  });

  it("aggregates hidden paragraphs into document endpoints while retaining native evidence", async () => {
    const blocks = [doc("a", "Alpha"), doc("b", "Beta"), paragraph("p1", "a", "Beta"), paragraph("p2", "a", "Beta Beta")];
    const index = await indexOf(blocks);
    const scope = scopeOf(blocks);
    scope.entries = scope.entries.map(entry => entry.id.startsWith("p") ? { ...entry, index: 0, displayId: "a" } : entry);
    const result = await index.query(scope, "selected", ["a"], controller().signal);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ source: 0, target: 1, weight: 3 });
    expect(result.edges[0].provenance!.map(item => item.sourceId)).toEqual(["p1", "p2"]);
  });

  it("reuses unchanged matches, invalidates edited text and names, and drops deleted targets", async () => {
    const blocks = [doc("a", "Alpha"), doc("b", "Beta"), paragraph("p", "a", "Beta Gamma")];
    const index = await indexOf(blocks);
    index.replace(blocks.map(block => ({ ...block })));
    await index.warm(() => {}, controller().signal);
    expect(index.progress.cached).toBe(1);
    const renamed = [blocks[0], doc("b", "Gamma"), blocks[2]];
    index.replace(renamed);
    await index.warm(() => {}, controller().signal);
    expect(index.progress.cached).toBe(0);
    expect((await index.query(scopeOf(renamed), "all", [], controller().signal)).edges[0].provenance![0].mention!.matched).toBe("Gamma");
    const changed = [...renamed.slice(0, 2), paragraph("p", "a", "No remaining names")];
    index.replace(changed);
    await index.warm(() => {}, controller().signal);
    expect((await index.query(scopeOf(changed), "all", [], controller().signal)).edges).toEqual([]);
    index.replace([blocks[0], blocks[2]]);
    await index.warm(() => {}, controller().signal);
    expect((await index.query(scopeOf(blocks), "all", [], controller().signal)).edges).toEqual([]);
  });

  it("does not scan containers/code or create virtual document self-loops", async () => {
    const blocks = [doc("a", "Alpha"), doc("b", "Beta"), { ...paragraph("list", "a", "Beta"), type: "l" }, { ...paragraph("code", "a", "Beta"), type: "c" }, paragraph("p", "a", "Alpha")];
    const index = await indexOf(blocks);
    expect(index.progress.total).toBe(1);
    expect((await index.query(scopeOf(blocks), "all", [], controller().signal)).edges).toEqual([]);
  });

  it("uses exact case for single-character names while keeping their word boundaries", async () => {
    const blocks = [doc("a", "Source"), doc("b", "B"), paragraph("p", "a", "b B BETA")];
    const index = await indexOf(blocks);
    expect((await index.query(scopeOf(blocks), "all", [], controller().signal)).edges[0].weight).toBe(1);
  });

  it("reports bounded acquisition/index/display evidence instead of claiming complete results", async () => {
    const blocks = [doc("a", "Alpha"), doc("b", "Beta"), doc("c", "Gamma"), paragraph("p", "a", "Beta Gamma"), paragraph("q", "a", "Beta"), paragraph("long", "a", "x".repeat(60))];
    const index = await indexOf(blocks, { sourceCharacters: 50, edges: 1, provenancePerEdge: 1 });
    expect(index.progress.skippedSources).toBe(1);
    expect((await index.query(scopeOf(blocks), "all", [], controller().signal)).truncated).toBe(true);
    const scope = scopeOf(blocks);
    scope.entries = scope.entries.map(entry => ["p", "q"].includes(entry.id) ? { ...entry, index: 0, displayId: "a" } : entry).filter(entry => entry.id !== "c");
    const result = await index.query(scope, "all", [], controller().signal);
    expect(result.edges[0]).toMatchObject({ weight: 2, omittedProvenance: 1 });
    const limited = await indexOf(blocks, { occurrencesPerSource: 1 });
    expect(limited.progress.limitedSources).toBeGreaterThan(0);
  });

  it("cancels obsolete warm/query jobs", async () => {
    const blocks = [doc("a", "Alpha"), doc("b", "Beta"), paragraph("p", "a", "Beta")];
    const index = new MentionIndex();
    index.replace(blocks);
    const abort = controller();
    abort.abort();
    await expect(index.warm(() => {}, abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(index.ready).toBe(false);
    await expect(index.query(scopeOf(blocks), "all", [], abort.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("keeps shared limited passages stable and enforces the cache budget after source reordering", async () => {
    const blocks = [doc("a", "Source"), doc("b", "Beta"), paragraph("p", "a", "Beta Beta"), paragraph("q", "a", "Beta Beta")];
    const index = await indexOf(blocks, { cachedOccurrences: 1 });
    const first = await index.query(scopeOf(blocks), "all", [], controller().signal);
    expect(first.edges.map(edge => edge.weight)).toEqual([1, 1]);
    expect(index.progress.limitedSources).toBe(2);
    // A new body can consume the budget before an unchanged cached body. The
    // old body must then report its omitted hits, never exceed the global cap.
    const reordered = [blocks[0], blocks[1], paragraph("new", "a", "Beta"), ...blocks.slice(2)];
    index.replace(reordered);
    await index.warm(() => {}, controller().signal);
    const next = await index.query(scopeOf(reordered), "all", [], controller().signal);
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0].provenance![0].sourceId).toBe("new");
    expect(index.progress.limitedSources).toBe(2);
    const cached = await indexOf([blocks[0], blocks[1], paragraph("old", "a", "Beta")], { cachedOccurrences: 1 });
    const extended = [blocks[0], blocks[1], paragraph("new", "a", "Beta!"), paragraph("old", "a", "Beta")];
    cached.replace(extended);
    await cached.warm(() => {}, controller().signal);
    expect((await cached.query(scopeOf(extended), "all", [], controller().signal)).edges).toHaveLength(1);
    expect(cached.progress.limitedSources).toBe(1);
  });

  it("deduplicates a native target's normalized names without collapsing other native candidates", async () => {
    const blocks = [doc("a", "Source"), doc("b", "Beta", '{: name="BETA" alias="Beta,beta"}'), doc("c", "Beta"), paragraph("p", "a", "Beta")];
    const index = await indexOf(blocks);
    const result = await index.query(scopeOf(blocks), "all", [], controller().signal);
    expect(result.edges).toHaveLength(2);
    expect(result.edges.map(edge => edge.provenance![0].mention!.candidates)).toEqual([2, 2]);
  });
});
