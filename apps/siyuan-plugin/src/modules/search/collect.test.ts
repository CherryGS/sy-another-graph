import { describe, expect, it, vi } from "vitest";
import type { SearchApi } from "./collect";
import { collectSearchResults, type SearchConfig } from "./collect";
import { readOnlySearchProbe } from "./sql";

const id = (index: number) => `20260913000000-${index.toString(36).padStart(7, "0")}`;
const config: SearchConfig = {
  query: "topic",
  method: 0,
  sort: 3,
  group: 1,
  idPath: ["book/path"],
  types: { document: true } as SearchConfig["types"],
  subTypes: { h1: true } as SearchConfig["subTypes"],
};
const page = (indices: number[], total: number) => ({
  blocks: indices.map((index) => ({ id: id(index) })),
  matchedBlockCount: total,
  pageCount: 1,
});
const signal = () => new AbortController().signal;
const request = (mock: unknown) => mock as SearchApi;

describe("complete native search snapshots", () => {
  it("reads beyond visible and advertised pages while preserving final search semantics", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(page([1, 2], 5))
      .mockResolvedValueOnce(page([3, 4], 5))
      .mockResolvedValueOnce(page([5], 5));
    const progress = vi.fn();
    expect(await collectSearchResults(config, signal(), progress, request(mock))).toEqual(
      [1, 2, 3, 4, 5].map(id),
    );
    expect(mock.mock.calls.map((call) => call[1].page)).toEqual([1, 2, 3]);
    expect(mock.mock.calls[0][1]).toEqual({
      query: "topic",
      method: 0,
      types: config.types,
      subTypes: config.subTypes,
      paths: config.idPath,
      groupBy: 0,
      orderBy: 3,
      page: 1,
      pageSize: 512,
      searchHPath: true,
    });
    expect(config.group).toBe(1);
    expect(progress).toHaveBeenLastCalledWith(5, 5);
  });
  it("collects 100,000 identities across actual pages", async () => {
    const mock = vi.fn(async (_path, body) => {
      const start = (body.page - 1) * body.pageSize;
      return page(
        Array.from({ length: Math.min(body.pageSize, 100_000 - start) }, (_, i) => start + i),
        100_000,
      );
    });
    const result = await collectSearchResults(config, signal(), () => {}, request(mock));
    expect(result.length).toBe(100_000);
    expect(new Set(result).size).toBe(100_000);
    expect(mock).toHaveBeenCalledTimes(196);
  });
  it("rejects changing totals instead of opening a partial graph", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(page([1], 3))
      .mockResolvedValueOnce(page([2], 4));
    await expect(collectSearchResults(config, signal(), () => {}, request(mock))).rejects.toThrow(
      "发生变化",
    );
  });
  it.each([{ indices: [] }, { indices: [1] }])(
    "detects empty or repeated pages: %j",
    async ({ indices }) => {
      const mock = vi
        .fn()
        .mockResolvedValueOnce(page([1], 3))
        .mockResolvedValueOnce(page(indices, 3));
      await expect(collectSearchResults(config, signal(), () => {}, request(mock))).rejects.toThrow(
        "分页不完整",
      );
      expect(mock).toHaveBeenCalledTimes(2);
    },
  );
  it("honors cancellation even when the request resolves after abort", async () => {
    const abort = new AbortController();
    const mock = vi.fn(async () => {
      abort.abort();
      return page([1], 1);
    });
    const progress = vi.fn();
    await expect(
      collectSearchResults(config, abort.signal, progress, request(mock)),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(progress).not.toHaveBeenCalled();
  });
  it("validates SQL using a read-only connection before invoking native search", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(page([1], 1));
    const sql = "SELECT * FROM blocks LIMIT 1;";
    await collectSearchResults(
      { ...config, method: 2, query: sql },
      signal(),
      () => {},
      request(mock),
    );
    expect(mock.mock.calls[0].slice(0, 2)).toEqual([
      "/api/query/sql",
      { mode: "readonly", stmt: "SELECT 1 FROM (\nSELECT * FROM blocks LIMIT 1\n) LIMIT 0" },
    ]);
    expect(mock.mock.calls[1][1].query).toBe(sql);
  });
  it("never runs native SQL search if read-only validation fails", async () => {
    const mock = vi.fn().mockRejectedValue(new Error("invalid query"));
    await expect(
      collectSearchResults(
        { method: 2, query: "DELETE FROM blocks" },
        signal(),
        () => {},
        request(mock),
      ),
    ).rejects.toThrow("invalid query");
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("supports HZ RLIKE without rewriting literals or the native request", async () => {
    const query =
      "select * from blocks where type rlike '^[d]$' and content != 'rlike' order by box ASC, hpath ASC";
    const mock = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(page([1], 1));
    await collectSearchResults({ method: 2, query }, signal(), () => {}, request(mock));
    expect(mock.mock.calls[0][1].stmt).toContain("type REGEXP '^[d]$' and content != 'rlike'");
    expect(mock.mock.calls[1][1].query).toBe(query);
    expect(
      readOnlySearchProbe(
        "SELECT \"rlike\", `rlike`, [rlike], 'it''s rlike' FROM blocks -- rlike\nWHERE type RLIKE 'd' /* rlike */;",
      ),
    ).toBe(
      "SELECT 1 FROM (\nSELECT \"rlike\", `rlike`, [rlike], 'it''s rlike' FROM blocks -- rlike\nWHERE type REGEXP 'd' /* rlike */\n) LIMIT 0",
    );
  });
  it.each([
    { blocks: [{ id: "invalid" }], matchedBlockCount: 1 },
    { blocks: [], matchedBlockCount: 500_001 },
    { blocks: [], matchedBlockCount: -1 },
    { blocks: [], matchedBlockCount: 0 },
  ])("rejects invalid, empty, or excessive results", async (result) => {
    await expect(
      collectSearchResults(config, signal(), () => {}, request(vi.fn().mockResolvedValue(result))),
    ).rejects.toThrow();
  });
  it("does not turn recent updates or semantic search into a different query", async () => {
    const mock = vi.fn();
    for (const config of [{ query: "" }, { query: "topic", method: 4 }])
      await expect(
        collectSearchResults(config, signal(), () => {}, request(mock)),
      ).rejects.toThrow();
    expect(mock).not.toHaveBeenCalled();
  });
});
