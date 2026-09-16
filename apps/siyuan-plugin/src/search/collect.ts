import type { IEventBusMap } from "siyuan";
import { api } from "../data/api";
import { MAX_SEARCH_RESULTS } from "./model";
import { readOnlySearchProbe } from "./sql";

export type SearchConfig = IEventBusMap["before-search-results-render"]["config"];
type SearchApi = typeof api;
const PAGE_SIZE = 512;
const MAX_PAGES = 10_000;

export function unsupportedSearch(config: SearchConfig): string {
  if ((config.query?.length ?? 0) > 100_000) return "搜索条件过长，请缩短到 10 万字符以内。";
  if (!config.query?.trim() && !config.idPath?.length)
    return "请输入搜索条件；最近更新列表不属于搜索结果。";
  if (![0, 1, 2, 3].includes(config.method ?? 0))
    return "暂不支持语义搜索建图，请使用关键字、查询语法、SQL 或正则搜索。";
  return "";
}

/** Use the final native request, including HZ's translation. Group headers are
 * presentation context, so request ungrouped matches instead of scraping the UI. */
export async function collectSearchResults(
  config: SearchConfig,
  signal: AbortSignal,
  progress: (read: number, total: number) => void,
  request: SearchApi = api,
): Promise<string[]> {
  const reason = unsupportedSearch(config);
  if (reason) throw new Error(reason);
  signal.throwIfAborted();
  if (config.method === 2) {
    // The native SQL-search fallback can execute arbitrary statements. Validate
    // a single query in the kernel's read-only connection before invoking it.
    await request(
      "/api/query/sql",
      { stmt: readOnlySearchProbe(config.query ?? ""), mode: "readonly" },
      signal,
    );
  }
  const ids = new Set<string>();
  let expected: number | undefined;
  for (let page = 1; page <= MAX_PAGES; page++) {
    signal.throwIfAborted();
    const result = await request<{
      blocks: { id?: unknown }[];
      matchedBlockCount: number;
    }>(
      "/api/search/fullTextSearchBlock",
      {
        query: config.query ?? "",
        method: config.method ?? 0,
        types: config.types,
        subTypes: config.subTypes,
        paths: config.idPath ?? [],
        groupBy: 0,
        orderBy: config.sort ?? 0,
        page,
        pageSize: PAGE_SIZE,
        searchHPath: !config.hasReplace,
      },
      signal,
    );
    signal.throwIfAborted();
    const total = result?.matchedBlockCount;
    if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(result.blocks))
      throw new Error(`搜索第 ${page} 页返回了无效结果，无法确认完整范围。`);
    if (total > MAX_SEARCH_RESULTS)
      throw new Error(
        `搜索命中 ${total.toLocaleString()} 个块，超过临时建图的 ${MAX_SEARCH_RESULTS.toLocaleString()} 个结果上限，请缩小搜索范围。`,
      );
    if (expected !== undefined && total !== expected)
      throw new Error(`搜索结果在读取期间发生变化（${expected} → ${total}），请重新搜索后建图。`);
    expected = total;
    if (!total)
      throw new Error("没有可用于建图的搜索结果，请重新搜索。加密笔记本暂不支持搜索建图。");
    const before = ids.size;
    for (const block of result.blocks) {
      if (typeof block?.id !== "string" || !/^\d{14}-[a-z0-9]{7}$/.test(block.id))
        throw new Error(`搜索第 ${page} 页包含无效块 ID，无法确认完整范围。`);
      ids.add(block.id);
    }
    progress(ids.size, total);
    if (ids.size === total) return [...ids];
    if (ids.size > total || ids.size === before)
      throw new Error(
        `搜索分页不完整：已读取 ${ids.size} / ${total} 个不同的块（第 ${page} 页）。请重新搜索；复杂 SQL 可能无法完整分页。`,
      );
    // SQL with LIMIT can override the requested page size; native pageCount is
    // then misleading. Completion depends on distinct identities and total.
  }
  throw new Error(
    `搜索分页超过 ${MAX_PAGES} 页，已读取 ${ids.size} / ${expected} 个块，请缩小范围或移除 SQL 中过小的 LIMIT。`,
  );
}
