import { message as msg, MessageError, type Failure } from "../../core/diagnostics/message";
import { MAX_SEARCH_RESULTS } from "./model";
import { readOnlySearchProbe } from "./sql";

/** Preserve the host's final search request without depending on its SDK types. */
export interface SearchConfig {
  query?: string;
  method?: number;
  sort?: number;
  group?: number;
  idPath?: string[];
  hPath?: string;
  hasReplace?: boolean;
  types?: object;
  subTypes?: object;
}
export type SearchApi = <T>(path: string, body: unknown, signal?: AbortSignal) => Promise<T>;
const PAGE_SIZE = 512;
const MAX_PAGES = 10_000;

export function unsupportedSearch(config: SearchConfig): Failure {
  if ((config.query?.length ?? 0) > 100_000) return msg("text.theSearchQueryIsTooLongReduceIt");
  if (!config.query?.trim() && !config.idPath?.length)
    return msg("text.enterASearchQueryTheRecentlyUpdatedList");
  if (![0, 1, 2, 3].includes(config.method ?? 0))
    return msg("text.semanticSearchIsNotSupportedForGraphCreation");
  return "";
}

/** Use the final native request, including HZ's translation. Group headers are
 * presentation context, so request ungrouped matches instead of scraping the UI. */
export async function collectSearchResults(
  config: SearchConfig,
  signal: AbortSignal,
  progress: (read: number, total: number) => void,
  request: SearchApi,
): Promise<string[]> {
  const reason = unsupportedSearch(config);
  if (reason) throw new MessageError(reason);
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
      throw new MessageError(
        msg("text.searchPageValueReturnedInvalidResultsTheComplete", { p0: page }),
      );
    if (total > MAX_SEARCH_RESULTS)
      throw new MessageError(
        msg("text.theSearchMatchedValueBlocksExceedingTheLimit", {
          p0: total,
          p1: MAX_SEARCH_RESULTS,
        }),
      );
    if (expected !== undefined && total !== expected)
      throw new MessageError(
        msg("text.searchResultsChangedWhileReadingValueValueSearch", { p0: expected, p1: total }),
      );
    expected = total;
    if (!total) throw new MessageError(msg("text.noSearchResultsAreAvailableForGraphCreation"));
    const before = ids.size;
    for (const block of result.blocks) {
      if (typeof block?.id !== "string" || !/^\d{14}-[a-z0-9]{7}$/.test(block.id))
        throw new MessageError(msg("text.searchPageValueContainsInvalidBlockIdsThe", { p0: page }));
      ids.add(block.id);
    }
    progress(ids.size, total);
    if (ids.size === total) return [...ids];
    if (ids.size > total || ids.size === before)
      throw new MessageError(
        msg("text.searchPaginationIsIncompleteValueValueDistinctBlocks", {
          p0: ids.size,
          p1: total,
          p2: page,
        }),
      );
    // SQL with LIMIT can override the requested page size; native pageCount is
    // then misleading. Completion depends on distinct identities and total.
  }
  throw new MessageError(
    msg("text.searchExceededValuePagesWithValueValueBlocks", {
      p0: MAX_PAGES,
      p1: ids.size,
      p2: expected ?? 0,
    }),
  );
}
