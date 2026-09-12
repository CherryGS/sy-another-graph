import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GRAPH_TAB_TITLE, GraphTabTitle } from "./graph-tab-title";

function harness() {
  const source = {};
  const origin = "http://127.0.0.1:6806";
  const titles = new GraphTabTitle(event => event.source === source && event.origin === origin);
  const message = (data = {}, event = {}) => titles.handle({
    source, origin,
    data: { channel: "sy-another-graph", type: "graph-tab-state", title: "图谱 · 项目 A · 阅读", description: "范围：项目 A；预设：阅读", ...data },
    ...event,
  } as MessageEvent);
  const tab = () => {
    const attributes = new Map<string, string>();
    const headElement = {
      title: "",
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      classList: { add: vi.fn() },
    } as unknown as HTMLElement;
    const target = { title: "Atlas 图谱", headElement, updateTitle: vi.fn((value: string) => { target.title = value; }), attributes };
    return target;
  };
  return { titles, message, tab };
}

describe("graph tab state", () => {
  it("applies current state to existing and reattached tab models without recreating the graph", () => {
    const h = harness();
    const first = h.tab();
    h.titles.attach(first);
    expect(first.title).toBe(DEFAULT_GRAPH_TAB_TITLE);
    h.message();
    expect(first.title).toBe("图谱 · 项目 A · 阅读");
    h.titles.detach(first);
    h.message({ title: "图谱 · 项目 B · 阅读*" });
    expect(first.title).toBe("图谱 · 项目 A · 阅读");
    const reopened = h.tab();
    h.titles.attach(reopened);
    expect(reopened.title).toBe("图谱 · 项目 B · 阅读*");
    expect(h.titles.title).toBe(reopened.title);
    h.titles.attach(first);
    expect(first.title).toBe(reopened.title);
  });

  it("passes literal title text to the escaping host API and encodes native HTML tooltips", () => {
    const h = harness();
    const tab = h.tab();
    h.titles.attach(tab);
    const title = '图谱 · <img src=x onerror="bad()"> &amp;';
    const description = '范围：<b>项目</b> &amp; <svg onload="bad()">';
    h.message({ title, description });
    expect(tab.updateTitle).toHaveBeenLastCalledWith(title);
    expect(tab.title).toBe(title);
    expect(tab.headElement.title).toBe(description);
    expect(tab.attributes.get("aria-label")).toBe('范围：&lt;b&gt;项目&lt;/b&gt; &amp;amp; &lt;svg onload="bad()"&gt;');
    h.message({ title, description });
    expect(tab.updateTitle).toHaveBeenCalledTimes(2);
    h.message({ title, description: "范围：新的说明" });
    expect(tab.updateTitle).toHaveBeenCalledTimes(2);
    expect(tab.headElement.title).toBe("范围：新的说明");
  });

  it("rejects unowned messages and invalid labels and stops all updates after unload", () => {
    const h = harness();
    const tab = h.tab();
    h.titles.attach(tab);
    h.message({}, { source: {} });
    h.message({}, { origin: "https://other.example" });
    for (const data of [
      { channel: "other" }, { type: "other" }, { title: "" }, { title: "a".repeat(161) },
      { description: "a".repeat(1001) }, { title: "bad\nname" }, { description: "bad\u0085name" },
    ]) h.message(data);
    expect(tab.title).toBe(DEFAULT_GRAPH_TAB_TITLE);
    expect(tab.updateTitle).toHaveBeenCalledOnce();
    h.titles.dispose();
    h.message();
    const next = h.tab();
    h.titles.attach(next);
    expect(next.updateTitle).not.toHaveBeenCalled();
    expect(tab.updateTitle).toHaveBeenCalledOnce();
  });
});
