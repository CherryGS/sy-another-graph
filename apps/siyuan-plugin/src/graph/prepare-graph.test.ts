import { describe, expect, it } from "vitest";
import type { Table } from "apache-arrow";
import { prepareGraph } from "./prepare-graph";
import type { CanvasNode } from "./types";
import { nodeColor } from "./node-colors";

function node(id: string, index: number): CanvasNode {
  return {
    id,
    index,
    label: id,
    degree: 1,
    notebook: "test",
    path: "",
    color: "#abcdef",
  };
}

describe("prepareGraph", () => {
  it("remaps filtered stable indices to dense points and removes dangling links", async () => {
    const result = await prepareGraph(
      [node("gamma", 18), node("alpha", 3)],
      [
        { source: 3, target: 18, kind: "reference", weight: 2 },
        { source: 4, target: 18, kind: "hierarchy", weight: 1 },
        { source: 18, target: 3, kind: "hierarchy", weight: 1 },
      ],
      new AbortController().signal,
    );
    expect(result.indexToId).toEqual(["gamma", "alpha"]);
    expect(result.idToIndex.get("alpha")).toBe(1);
    expect(result.linksCount).toBe(2);
    const points = result.config.points as Table;
    const links = result.config.links as Table;
    expect(Array.from(points.getChild("index")!)).toEqual([0, 1]);
    expect(Array.from(links.getChild("sourceIndex")!)).toEqual([1, 0]);
    expect(Array.from(links.getChild("targetIndex")!)).toEqual([0, 1]);
    expect(Array.from(links.getChild("source")!)).toEqual(["alpha", "gamma"]);
    expect(Array.from(links.getChild("target")!)).toEqual(["gamma", "alpha"]);
    expect(Array.from(links.getChild("color")!)).toEqual([
      "#91b7df",
      "#60728d",
    ]);
    expect(Array.from(links.getChild("style")!)).toEqual([0, 1]);
    const widths = Array.from(links.getChild("width")!) as number[];
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[0]).toBeGreaterThanOrEqual(1.55);
    expect(widths[0]).toBeLessThanOrEqual(2.35);
    expect(result.config.linkWidthStrategy).toBe("direct");
    expect(result.config.linkStyleBy).toBe("style");
  });

  it("supports a graph containing nodes without any visible edges", async () => {
    const result = await prepareGraph(
      [node("alpha", 3)],
      [],
      new AbortController().signal,
    );
    expect(result.pointsCount).toBe(1);
    expect(result.linksCount).toBe(0);
    const links = result.config.links as Table;
    expect(links.numRows).toBe(0);
    expect(links.getChild("source")?.type.toString()).toBe("Utf8");
    expect(links.getChild("sourceIndex")?.type.toString()).toBe("Uint32");
    expect(links.getChild("width")?.type.toString()).toBe("Float32");
    expect(links.getChild("style")?.type.toString()).toBe("Uint8");
  });

  it("does not publish preparation that was cancelled while yielding to the browser", async () => {
    const controller = new AbortController();
    const pending = prepareGraph([node("alpha", 3)], [], controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects duplicate IDs or source indices instead of misdirecting navigation", async () => {
    await expect(
      prepareGraph(
        [node("alpha", 3), node("alpha", 4)],
        [],
        new AbortController().signal,
      ),
    ).rejects.toThrow("重复");
    await expect(
      prepareGraph(
        [node("alpha", 3), node("beta", 3)],
        [],
        new AbortController().signal,
      ),
    ).rejects.toThrow("重复");
  });

  it("encodes HTML-capable note titles as literal label text", async () => {
    const input = {
      ...node("alpha", 3),
      label: '<img src="https://example.invalid/pixel"> A & B',
    };
    const result = await prepareGraph(
      [input],
      [],
      new AbortController().signal,
    );
    const points = result.config.points as Table;
    expect(points.getChild("label")!.get(0)).toBe(
      "&lt;img src=&quot;https://example.invalid/pixel&quot;&gt; A &amp; B",
    );
    expect(input.label).toBe('<img src="https://example.invalid/pixel"> A & B');
  });

  it("prepares all color modes once so display controls can reuse the uploaded topology", async () => {
    const input = { ...node("alpha", 3), path: "/root/branch.sy", degree: 20 };
    const result = await prepareGraph(
      [input],
      [],
      new AbortController().signal,
    );
    const points = result.config.points as Table;
    expect(points.getChild("color")!.get(0)).toBe(input.color);
    expect(points.getChild("branchColor")!.get(0)).toBe(
      nodeColor(input, "branch"),
    );
    expect(points.getChild("degreeColor")!.get(0)).toBe(
      nodeColor(input, "degree"),
    );
    expect(result.config.pointColorBy).toBe("branchColor");
  });
});
