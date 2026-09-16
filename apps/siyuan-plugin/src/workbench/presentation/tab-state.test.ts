import { beforeEach as beforeLocaleTest, describe, expect, it } from "vitest";
import { setLocale } from "../../shared/i18n/runtime";
beforeLocaleTest(() => setLocale("zh-CN"));

import { type GraphDataset } from "../../core/graph/types";
import { DEFAULT_FILTERS } from "../../modules/presets/filters";
import { GraphTabTitle } from "../../adapters/siyuan/host/graph-tab-title";
import { graphTabState } from "./tab-state";

const BOOK = "20260912000000-book001";
const BLOCK = "20260912000001-block01";
const data: GraphDataset = {
  source: "siyuan",
  loadedAt: "",
  loadMs: 0,
  referenceCount: 0,
  skippedReferences: 0,
  warnings: [],
  notebooks: [{ id: BOOK, name: "Research" }],
  edges: [],
  nodes: [
    {
      id: BLOCK,
      index: 0,
      label: "Project A",
      notebook: BOOK,
      blockType: "d",
      path: "",
    },
  ],
};

describe("semantic graph tab state", () => {
  it("uses scope and preset state while retaining complete rule details in the tooltip", () => {
    const filters = {
      ...DEFAULT_FILTERS,
      notebook: BOOK,
      scopeId: BLOCK,
      documentsOnly: false,
      hiddenTypes: ["p"],
      hierarchy: true,
      mentions: "selected" as const,
      includeChildDocuments: false,
      excludeIds: [BLOCK],
      excludedMentionPhrases: ["01", "todo"],
      hideIsolated: true,
    };
    const state = graphTabState(filters, data, "Reading", true);
    expect(state.title).toBe("图谱 · Project A · Reading*");
    for (const text of [
      BLOCK,
      "笔记本：Research",
      "已修改",
      "隐藏：",
      "包含关系",
      "已选节点",
      "排除词组：2 项",
      "子文档：不包含",
      "排除：1 项",
      "隐藏未选中的节点",
    ])
      expect(state.description).toContain(text);
    expect(
      graphTabState({ ...DEFAULT_FILTERS, notebook: BOOK }, data, "Reading", false).title,
    ).toBe("图谱 · Research · Reading");
    expect(graphTabState(DEFAULT_FILTERS, null, "", false).title).toBe("图谱 · 全部 · 自定义");
    expect(graphTabState(filters, null, "Reading", false).title).toBe("图谱 · 指定范围 · Reading");
  });

  it("ignores search, node counts, indices, and acquisition timings but tracks source name changes", () => {
    const filters = { ...DEFAULT_FILTERS, scopeId: BLOCK };
    const first = graphTabState(filters, data, "Reading", false);
    const refreshed = {
      ...data,
      loadedAt: "later",
      loadMs: 10_000,
      referenceCount: 999,
      nodes: [
        { ...data.nodes[0], index: 77 },
        { ...data.nodes[0], id: "other", index: 1 },
      ],
    };
    expect(
      graphTabState({ ...filters, query: "a new search" }, refreshed, "Reading", false),
    ).toEqual(first);
    expect(
      graphTabState(
        filters,
        { ...refreshed, nodes: [{ ...data.nodes[0], label: "Renamed" }] },
        "Reading",
        false,
      ).title,
    ).toBe("图谱 · Renamed · Reading");
  });

  it("removes forbidden controls and truncates long Unicode without splitting code points or violating host limits", () => {
    const title = "🧠".repeat(800) + "\u0000\u0081\ntext";
    const large = {
      ...data,
      nodes: [{ ...data.nodes[0], label: title }],
      notebooks: [{ ...data.notebooks[0], name: title }],
    };
    const filters = {
      ...DEFAULT_FILTERS,
      scopeId: BLOCK,
      notebook: BOOK,
      documentsOnly: false,
      hiddenTypes: Array(100).fill(title),
    };
    const state = graphTabState(filters, large, title, true);
    expect(state.title.length).toBeLessThanOrEqual(160);
    expect(state.description.length).toBeLessThanOrEqual(1000);
    expect(state.title).toContain("…");
    for (const value of [state.title, state.description]) {
      expect(
        Array.from(value).every((character) => {
          const code = character.codePointAt(0)!;
          return code < 0xd800 || code > 0xdfff;
        }),
      ).toBe(true);
      expect(
        Array.from(value).every((character) => {
          const code = character.charCodeAt(0);
          return code > 31 && (code < 127 || code > 159);
        }),
      ).toBe(true);
    }
    const host = new GraphTabTitle(() => true);
    expect(
      host.handle({
        data: { channel: "sy-another-graph", type: "graph-tab-state", ...state },
      } as MessageEvent),
    ).toBe(true);
    expect(host.title).toBe(state.title);
    const cleaned = graphTabState(
      { ...DEFAULT_FILTERS, scopeId: BLOCK },
      { ...data, nodes: [{ ...data.nodes[0], label: "A\u0000\u0081\nB" }] },
      "Read\u0000\u0081\nmode",
      false,
    );
    expect(cleaned.title).toBe("图谱 · A B · Read mode");
    host.dispose();
  });
});
