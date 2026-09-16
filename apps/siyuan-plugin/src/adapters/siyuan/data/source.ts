import { message as msg, MessageError } from "../../../core/diagnostics/message";
import type { SourceProgress } from "../../../core/diagnostics/progress";
import { api } from "./api";
import { addDatabaseGraph } from "./database-source";
import { ReadIssueCollector } from "../../../core/diagnostics/read-issues";
import { type GraphDataset, type GraphNode, type GraphEdge } from "../../../core/graph/types";
export { api } from "./api";

/** Native SQL block identity; optional metadata also accepts legacy fixtures. */
export interface BlockRow {
  id: string;
  box: string;
  path: string;
  hpath?: string | null;
  content: string;
  type?: string;
  root_id?: string;
  parent_id?: string;
  ial?: string;
  markdown?: string;
}
interface ReferenceRow {
  source: string;
  target: string;
  weight: number;
}
interface BlockState {
  total: number;
  last: string | null;
}
interface ReferenceState {
  total: number;
  high: string | null;
}
interface ReferenceWindow extends ReferenceState {
  groups: string;
}
type Progress = (message: SourceProgress) => void;

async function sql<T>(stmt: string, signal?: AbortSignal): Promise<T[]> {
  const rows = await api<T[]>("/api/query/sql", { stmt, mode: "readonly" }, signal);
  if (!Array.isArray(rows)) throw new MessageError(msg("text.theSiyuanQueryReturnedNoRows"));
  return rows;
}
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

const BLOCK_STATE_SQL = "SELECT count(*) AS total, max(id) AS last FROM blocks";
const REFERENCE_STATE_SQL = "SELECT count(*) AS total, CAST(max(rowid) AS TEXT) AS high FROM refs";
const REFERENCE_BATCH_SIZE = 4096;

function checkedCount(value: unknown): number {
  const number = Number(value);
  if (value == null || !Number.isSafeInteger(number) || number < 0)
    throw new MessageError(msg("text.siyuanReturnedAnInvalidGraphCount"));
  return number;
}

async function blockState(signal: AbortSignal): Promise<BlockState> {
  const [state] = await sql<BlockState>(BLOCK_STATE_SQL, signal);
  if (!state) throw new MessageError(msg("text.cannotValidateTheBlockCount"));
  const total = checkedCount(state.total);
  if (total > 0 && (typeof state.last !== "string" || !state.last))
    throw new MessageError(msg("text.cannotDetermineTheBlockPaginationBoundary"));
  return { total, last: total === 0 ? null : state.last };
}

async function referenceState(signal: AbortSignal): Promise<ReferenceState> {
  const [state] = await sql<ReferenceState>(REFERENCE_STATE_SQL, signal);
  if (!state) throw new MessageError(msg("text.cannotValidateTheReferenceCount"));
  const total = checkedCount(state.total);
  return { total, high: total === 0 ? null : checkedRowId(state.high) };
}

function checkedRowId(value: unknown): string {
  // SQLite rowids are signed 64-bit integers; Number would round large values.
  if (typeof value !== "string" || !/^-?\d{1,19}$/.test(value))
    throw new MessageError(msg("text.cannotDetermineTheReferencePaginationBoundary"));
  const rowid = BigInt(value);
  if (rowid < -9223372036854775808n || rowid > 9223372036854775807n)
    throw new MessageError(msg("text.theReferencePaginationBoundaryExceedsSqliteSRange"));
  return rowid.toString();
}

function referenceWindowSql(cursor: string | null, high: string): string {
  const lower = cursor === null ? "" : `rowid > CAST(${quote(cursor)} AS INTEGER) AND `;
  // The inner LIMIT is applied before grouping, so each raw row is scanned once
  // through SQLite's rowid index. One bounded JSON result prevents host row caps
  // from dropping groups while advancing the raw cursor beyond them.
  return `SELECT json_group_array(json_array(source, target, weight)) AS groups,
    coalesce(sum(weight), 0) AS total, CAST(max(high) AS TEXT) AS high
    FROM (SELECT block_id AS source, def_block_id AS target, count(*) AS weight, max(seq) AS high
      FROM (SELECT rowid AS seq, block_id, def_block_id FROM refs
        WHERE ${lower}rowid <= CAST(${quote(high)} AS INTEGER) ORDER BY rowid LIMIT ${REFERENCE_BATCH_SIZE})
      GROUP BY block_id, def_block_id) AS pairs LIMIT 1`;
}

function decodeReferenceWindow(window: ReferenceWindow): ReferenceRow[] {
  let groups: unknown;
  try {
    groups = JSON.parse(window.groups);
  } catch {
    throw new MessageError(msg("text.siyuanReturnedAnInvalidReferenceBatch"));
  }
  if (!Array.isArray(groups))
    throw new MessageError(msg("text.siyuanReturnedAnInvalidReferenceBatch"));
  const rows: ReferenceRow[] = [];
  let total = 0;
  for (const group of groups) {
    if (
      !Array.isArray(group) ||
      group.length !== 3 ||
      typeof group[0] !== "string" ||
      typeof group[1] !== "string"
    )
      throw new MessageError(msg("text.siyuanReturnedAnInvalidReferenceBatch"));
    const weight = checkedCount(group[2]);
    if (weight === 0) throw new MessageError(msg("text.siyuanReturnedAnInvalidReferenceWeight"));
    total = checkedCount(total + weight);
    rows.push({ source: group[0], target: group[1], weight });
  }
  if (total !== checkedCount(window.total) || total > REFERENCE_BATCH_SIZE)
    throw new MessageError(msg("text.siyuanReturnedAnIncompleteReferenceBatch"));
  return rows;
}

export function normalizeGraph(
  blocks: BlockRow[],
  references: ReferenceRow[],
): Pick<GraphDataset, "nodes" | "edges" | "referenceCount" | "skippedReferences" | "warnings"> {
  const nodes: GraphNode[] = blocks
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((block, index) => ({
      id: block.id,
      label: blockLabel(block),
      notebook: block.box,
      path: block.path,
      humanPath: typeof block.hpath === "string" && block.hpath ? block.hpath : undefined,
      index,
      entity: "block",
      blockType: block.type || "d",
      rootId: block.type && block.type !== "d" ? block.root_id : block.id,
      parentId: block.parent_id || undefined,
      content: block.content,
      openBlockId: block.id,
    }));
  const byId = new Map(nodes.map((node) => [node.id, node.index]));
  // Documents have their own root ID. Their parent document belongs to the
  // file tree, whereas non-document parent IDs come from SiYuan's block index.
  for (const node of nodes) {
    if (node.blockType === "d") {
      const segments = node.path.split("/").filter(Boolean);
      const parentId = segments.length > 1 ? segments.at(-2) : undefined;
      const parent = parentId === undefined ? undefined : byId.get(parentId);
      node.parentId =
        parent !== undefined &&
        nodes[parent].blockType === "d" &&
        nodes[parent].notebook === node.notebook
          ? parentId
          : undefined;
    }
    const documentIndex = node.rootId ? byId.get(node.rootId) : undefined;
    const document = documentIndex === undefined ? undefined : nodes[documentIndex];
    node.documentLabel =
      document?.blockType === "d" ? document.content || document.label : undefined;
  }
  assignHeadingContext(nodes, byId);
  const edges: GraphEdge[] = [];
  let referenceCount = 0;
  let skippedReferences = 0;
  const issues = new ReadIssueCollector();
  for (const reference of references) {
    const source = byId.get(reference.source);
    const target = byId.get(reference.target);
    const weight = Math.max(1, Number(reference.weight) || 1);
    referenceCount += weight;
    if (source === undefined || target === undefined) {
      skippedReferences += weight;
      const available =
        source !== undefined ? nodes[source] : target !== undefined ? nodes[target] : undefined;
      issues.add(
        "reference-endpoints",
        {
          fields: {
            "text.sourceBlockId": reference.source,
            "text.targetBlockId": reference.target,
            "text.missingEndpoints": msg(
              source === undefined && target === undefined
                ? "diagnostics.missingBothEndpoints"
                : source === undefined
                  ? "text.source"
                  : "text.target",
            ),
            "text.reason":
              !reference.source || !reference.target
                ? msg("text.theReferenceIndexContainsEmptyEndpointIds")
                : msg("text.theEndpointIsAbsentFromTheAcquiredBlock"),
            "text.referenceRecords": String(weight),
            ...(available
              ? {
                  "text.availableEndpoint": available.label,
                  "text.owningDocument": available.documentLabel ?? "",
                  "text.sourceLocation": available.humanPath || available.path,
                }
              : {}),
          },
          openBlockId: available?.id,
          openLabel:
            source !== undefined
              ? msg("text.openReferenceSource")
              : msg("text.openAvailableTarget"),
        },
        weight,
      );
      continue;
    }
    edges.push({
      source,
      target,
      kind: "reference",
      weight,
      // The native reference index may deduplicate repeated inline references;
      // weight counts indexed block-reference rows, not character occurrences.
      provenance: [
        {
          sourceId: reference.source,
          targetId: reference.target,
          kind: "reference",
          weight,
        },
      ],
    });
  }
  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent !== undefined && parent !== node.index)
      edges.push({
        source: parent,
        target: node.index,
        kind: "hierarchy",
        weight: 1,
        provenance: [
          {
            sourceId: nodes[parent].id,
            targetId: node.id,
            kind: "hierarchy",
            weight: 1,
          },
        ],
      });
  }
  return { nodes, edges, referenceCount, skippedReferences, warnings: issues.finish() };
}

function blockLabel(block: BlockRow): string {
  const text = (block.content || "").replace(/\s+/g, " ").trim();
  if (!text) return block.id;
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}

function assignHeadingContext(nodes: GraphNode[], byId: Map<string, number>): void {
  // null marks an invalid cyclic ancestry; undefined is a valid path containing
  // no headings. Descendants reuse the complete already-resolved parent path.
  const headingPaths = new Map<string, string | undefined | null>();
  for (const node of nodes) {
    if (node.blockType === "d") continue;
    const trail: GraphNode[] = [];
    const visited = new Set<string>();
    let current: GraphNode | undefined = node;
    let heading: string | undefined | null;
    while (current && current.rootId === node.rootId && current.blockType !== "d") {
      if (headingPaths.has(current.id)) {
        heading = headingPaths.get(current.id);
        break;
      }
      if (visited.has(current.id)) {
        heading = null;
        break;
      }
      visited.add(current.id);
      trail.push(current);
      const parent: number | undefined = current.parentId ? byId.get(current.parentId) : undefined;
      current = parent === undefined ? undefined : nodes[parent];
    }
    for (let index = trail.length - 1; index >= 0; index--) {
      const member = trail[index];
      if (heading !== null && member.blockType === "h") {
        const title = member.content || member.label;
        heading = heading ? `${heading} › ${title}` : title;
      }
      headingPaths.set(member.id, heading);
      member.heading = heading ?? undefined;
    }
    node.heading = heading ?? undefined;
  }
}

export async function loadSiYuanGraph(
  signal: AbortSignal,
  progress: Progress,
): Promise<GraphDataset> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  try {
    return await loadSnapshot(controller.signal, progress);
  } finally {
    signal.removeEventListener("abort", abort);
    // Also cancel sibling requests if one member of a parallel read failed.
    controller.abort();
  }
}

async function loadSnapshot(signal: AbortSignal, progress: Progress): Promise<GraphDataset> {
  const started = performance.now();
  progress({ phase: "notebooks" });
  const [notebookResult, initialBlocks, initialReferences] = await Promise.all([
    api<{ notebooks: { id: string; name: string; closed?: boolean }[] }>(
      "/api/notebook/lsNotebooks",
      {},
      signal,
    ),
    blockState(signal),
    referenceState(signal),
  ]);
  const notebooks = (notebookResult.notebooks ?? [])
    .filter((book) => !book.closed)
    .map((book) => ({
      id: book.id,
      name: book.name,
    }));
  const blocks: BlockRow[] = [];
  const pageSize = 1000;
  let cursor = "";
  while (initialBlocks.last !== null && cursor < initialBlocks.last) {
    const page = await sql<BlockRow>(
      `SELECT id, box, path, hpath, content, type, root_id, parent_id, ial, CASE WHEN type IN ('av','p','h','t') THEN markdown ELSE '' END AS markdown FROM blocks WHERE id > ${quote(cursor)} AND id <= ${quote(initialBlocks.last)} ORDER BY id LIMIT ${pageSize}`,
      signal,
    );
    if (page.length === 0) break;
    // SiYuan or a proxy may return fewer rows than LIMIT. A short page is not
    // proof of exhaustion; always advance until the initial high watermark.
    for (const row of page) {
      if (typeof row.id !== "string" || row.id <= cursor || row.id > initialBlocks.last)
        throw new MessageError(msg("text.blockPaginationStalledOrCrossedTheReadBoundary"));
      cursor = row.id;
    }
    blocks.push(...page);
    if (blocks.length > initialBlocks.total)
      throw new MessageError(msg("text.blocksMovedOutsideTheInitialPaginationRangeDuring"));
    progress({ phase: "blocks", completed: blocks.length, total: initialBlocks.total });
  }
  const referencePairs = new Map<string, ReferenceRow>();
  let referenceCursor: string | null = null;
  let rawReferences = 0;
  while (initialReferences.high !== null && referenceCursor !== initialReferences.high) {
    const [window] = await sql<ReferenceWindow>(
      referenceWindowSql(referenceCursor, initialReferences.high),
      signal,
    );
    if (!window) throw new MessageError(msg("text.referencePaginationIsIncompleteRefreshAndRetry"));
    const rows = decodeReferenceWindow(window);
    const total = checkedCount(window.total);
    if (total === 0) {
      if (window.high !== null)
        throw new MessageError(msg("text.siyuanReturnedAnInvalidReferencePaginationBoundary"));
      break;
    }
    const next = checkedRowId(window.high);
    if (
      (referenceCursor !== null && BigInt(next) <= BigInt(referenceCursor)) ||
      BigInt(next) > BigInt(initialReferences.high)
    )
      throw new MessageError(msg("text.referencePaginationStalledOrCrossedTheReadBoundary"));
    for (const row of rows) {
      const key = JSON.stringify([row.source, row.target]);
      const previous = referencePairs.get(key);
      if (previous) previous.weight = checkedCount(previous.weight + row.weight);
      else referencePairs.set(key, row);
    }
    referenceCursor = next;
    rawReferences = checkedCount(rawReferences + total);
    if (rawReferences > initialReferences.total)
      throw new MessageError(msg("text.referencesMovedOutsideTheInitialPaginationRangeDuring"));
    progress({
      phase: "references",
      completed: rawReferences,
      total: initialReferences.total,
      groups: referencePairs.size,
    });
  }
  const [finalBlocks, finalReferences] = await Promise.all([
    blockState(signal),
    referenceState(signal),
  ]);
  signal.throwIfAborted();
  const issues = new ReadIssueCollector();
  const blocksChanged =
    initialBlocks.total !== finalBlocks.total || initialBlocks.last !== finalBlocks.last;
  // These separate statements detect count/high-watermark changes, but cannot
  // promise an atomic snapshot under same-count edits or rowid reuse/VACUUM.
  const referencesChanged =
    initialReferences.total !== finalReferences.total ||
    initialReferences.high !== finalReferences.high;
  if (!blocksChanged && blocks.length !== initialBlocks.total)
    throw new MessageError(msg("text.blockPaginationIsIncompleteRefreshAndRetry"));
  if (!referencesChanged && rawReferences !== initialReferences.total)
    throw new MessageError(msg("text.referencePaginationIsIncompleteRefreshAndRetry"));
  if (blocksChanged || referencesChanged)
    issues.add("snapshot-changed", {
      fields: {
        "text.blockCountStartEnd": `${initialBlocks.total} → ${finalBlocks.total}`,
        "text.blockPaginationBoundaryStartEnd": `${initialBlocks.last} → ${finalBlocks.last}`,
        "text.actualBlocksRead": String(blocks.length),
        "text.referenceCountStartEnd": `${initialReferences.total} → ${finalReferences.total}`,
        "text.referencePaginationBoundaryStartEnd": `${initialReferences.high} → ${finalReferences.high}`,
        "text.actualReferencesRead": String(rawReferences),
      },
    });
  const graph = normalizeGraph(blocks, [...referencePairs.values()]);
  const databaseGraph = await addDatabaseGraph(graph, blocks, signal, progress);
  signal.throwIfAborted();
  return {
    ...graph,
    nodes: databaseGraph.nodes,
    edges: databaseGraph.edges,
    notebooks,
    source: "siyuan",
    loadedAt: new Date().toISOString(),
    mentionBlocks: blocks.map((block) => ({
      id: block.id,
      rootId: block.type && block.type !== "d" ? (block.root_id ?? block.id) : block.id,
      type: block.type || "d",
      title: !block.type || block.type === "d" ? block.content : "",
      ial: block.ial ?? "",
      markdown:
        ["p", "h", "t"].includes(block.type ?? "") && typeof block.markdown === "string"
          ? block.markdown
          : null,
    })),
    loadMs: performance.now() - started,
    warnings: [...issues.finish(), ...graph.warnings, ...databaseGraph.warnings],
  };
}
