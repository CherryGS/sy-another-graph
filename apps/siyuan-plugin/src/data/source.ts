import {
  PALETTE,
  type GraphDataset,
  type GraphNode,
  type GraphEdge,
  type Notebook,
} from "./types";

interface DocumentRow {
  id: string;
  box: string;
  path: string;
  content: string;
}
interface ReferenceRow {
  source: string;
  target: string;
  weight: number;
}
interface DocumentState {
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
type Progress = (message: string) => void;

export async function api<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(
    () =>
      controller.abort(
        new DOMException("思源接口请求超时，请重试", "TimeoutError"),
      ),
    30_000,
  );
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`思源接口返回 HTTP ${response.status}`);
    const result: unknown = await response.json();
    controller.signal.throwIfAborted();
    if (
      !result ||
      typeof result !== "object" ||
      !("code" in result) ||
      typeof result.code !== "number"
    ) {
      throw new Error("思源接口返回了无效数据");
    }
    const envelope = result as { code: number; msg?: string; data: T };
    if (envelope.code !== 0)
      throw new Error(envelope.msg || "思源接口请求失败");
    return envelope.data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

async function sql<T>(stmt: string, signal?: AbortSignal): Promise<T[]> {
  const rows = await api<T[]>(
    "/api/query/sql",
    { stmt, mode: "readonly" },
    signal,
  );
  if (!Array.isArray(rows)) throw new Error("思源查询未返回数据行");
  return rows;
}
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

const DOCUMENT_STATE_SQL =
  "SELECT count(*) AS total, max(id) AS last FROM blocks WHERE type='d'";
const REFERENCE_STATE_SQL =
  "SELECT count(*) AS total, CAST(max(rowid) AS TEXT) AS high FROM refs";
const REFERENCE_BATCH_SIZE = 4096;

function checkedCount(value: unknown): number {
  const number = Number(value);
  if (value == null || !Number.isSafeInteger(number) || number < 0)
    throw new Error("思源返回了无效的图谱计数");
  return number;
}

async function documentState(signal: AbortSignal): Promise<DocumentState> {
  const [state] = await sql<DocumentState>(DOCUMENT_STATE_SQL, signal);
  if (!state) throw new Error("无法校验文档总量");
  const total = checkedCount(state.total);
  if (total > 0 && (typeof state.last !== "string" || !state.last))
    throw new Error("无法确定文档分页边界");
  return { total, last: total === 0 ? null : state.last };
}

async function referenceState(signal: AbortSignal): Promise<ReferenceState> {
  const [state] = await sql<ReferenceState>(REFERENCE_STATE_SQL, signal);
  if (!state) throw new Error("无法校验引用总量");
  const total = checkedCount(state.total);
  return { total, high: total === 0 ? null : checkedRowId(state.high) };
}

function checkedRowId(value: unknown): string {
  // SQLite rowids are signed 64-bit integers; Number would round large values.
  if (typeof value !== "string" || !/^-?\d{1,19}$/.test(value))
    throw new Error("无法确定引用分页边界");
  const rowid = BigInt(value);
  if (rowid < -9223372036854775808n || rowid > 9223372036854775807n)
    throw new Error("引用分页边界超出 SQLite 范围");
  return rowid.toString();
}

function referenceWindowSql(cursor: string | null, high: string): string {
  const lower =
    cursor === null ? "" : `rowid > CAST(${quote(cursor)} AS INTEGER) AND `;
  // The inner LIMIT is applied before grouping, so each raw row is scanned once
  // through SQLite's rowid index. One bounded JSON result prevents host row caps
  // from dropping groups while advancing the raw cursor beyond them.
  return `SELECT json_group_array(json_array(source, target, weight)) AS groups,
    coalesce(sum(weight), 0) AS total, CAST(max(high) AS TEXT) AS high
    FROM (SELECT root_id AS source, def_block_root_id AS target, count(*) AS weight, max(seq) AS high
      FROM (SELECT rowid AS seq, root_id, def_block_root_id FROM refs
        WHERE ${lower}rowid <= CAST(${quote(high)} AS INTEGER) ORDER BY rowid LIMIT ${REFERENCE_BATCH_SIZE})
      GROUP BY root_id, def_block_root_id) AS pairs LIMIT 1`;
}

function decodeReferenceWindow(window: ReferenceWindow): ReferenceRow[] {
  let groups: unknown;
  try {
    groups = JSON.parse(window.groups);
  } catch {
    throw new Error("思源返回了无效的引用批次");
  }
  if (!Array.isArray(groups)) throw new Error("思源返回了无效的引用批次");
  const rows: ReferenceRow[] = [];
  let total = 0;
  for (const group of groups) {
    if (
      !Array.isArray(group) ||
      group.length !== 3 ||
      typeof group[0] !== "string" ||
      typeof group[1] !== "string"
    )
      throw new Error("思源返回了无效的引用批次");
    const weight = checkedCount(group[2]);
    if (weight === 0) throw new Error("思源返回了无效的引用权重");
    total = checkedCount(total + weight);
    rows.push({ source: group[0], target: group[1], weight });
  }
  if (total !== checkedCount(window.total) || total > REFERENCE_BATCH_SIZE)
    throw new Error("思源返回了不完整的引用批次");
  return rows;
}

export function normalizeGraph(
  documents: DocumentRow[],
  references: ReferenceRow[],
  notebooks: Notebook[],
): Pick<
  GraphDataset,
  "nodes" | "edges" | "referenceCount" | "skippedReferences"
> {
  const notebookColors = new Map(
    notebooks.map((book) => [book.id, book.color]),
  );
  const nodes: GraphNode[] = documents
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((doc, index) => ({
      id: doc.id,
      label: doc.content || "未命名文档",
      notebook: doc.box,
      path: doc.path,
      index,
      degree: 0,
      color: notebookColors.get(doc.box) ?? PALETTE[0],
    }));
  const byId = new Map(nodes.map((node) => [node.id, node.index]));
  const edges: GraphEdge[] = [];
  let referenceCount = 0;
  let skippedReferences = 0;
  for (const reference of references) {
    const source = byId.get(reference.source);
    const target = byId.get(reference.target);
    const weight = Math.max(1, Number(reference.weight) || 1);
    referenceCount += weight;
    if (source === undefined || target === undefined || source === target) {
      skippedReferences += weight;
      continue;
    }
    edges.push({ source, target, kind: "reference", weight });
  }
  for (const node of nodes) {
    const segments = node.path.split("/").filter(Boolean);
    const parent =
      segments.length > 1 ? byId.get(segments[segments.length - 2]) : undefined;
    if (parent !== undefined && parent !== node.index)
      edges.push({
        source: parent,
        target: node.index,
        kind: "hierarchy",
        weight: 1,
      });
  }
  for (const edge of edges) {
    nodes[edge.source].degree++;
    nodes[edge.target].degree++;
  }
  return { nodes, edges, referenceCount, skippedReferences };
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

async function loadSnapshot(
  signal: AbortSignal,
  progress: Progress,
): Promise<GraphDataset> {
  const started = performance.now();
  progress("正在读取思源笔记本…");
  const [notebookResult, initialDocuments, initialReferences] =
    await Promise.all([
      api<{ notebooks: { id: string; name: string; closed?: boolean }[] }>(
        "/api/notebook/lsNotebooks",
        {},
        signal,
      ),
      documentState(signal),
      referenceState(signal),
    ]);
  const notebooks = (notebookResult.notebooks ?? [])
    .filter((book) => !book.closed)
    .map((book, index) => ({
      id: book.id,
      name: book.name,
      color: PALETTE[index % PALETTE.length],
    }));
  const documents: DocumentRow[] = [];
  const pageSize = 1000;
  let cursor = "";
  while (initialDocuments.last !== null && cursor < initialDocuments.last) {
    const page = await sql<DocumentRow>(
      `SELECT id, box, path, content FROM blocks WHERE type='d' AND id > ${quote(cursor)} AND id <= ${quote(initialDocuments.last)} ORDER BY id LIMIT ${pageSize}`,
      signal,
    );
    if (page.length === 0) break;
    // SiYuan or a proxy may return fewer rows than LIMIT. A short page is not
    // proof of exhaustion; always advance until the initial high watermark.
    for (const row of page) {
      if (
        typeof row.id !== "string" ||
        row.id <= cursor ||
        row.id > initialDocuments.last
      )
        throw new Error("文档分页未前进或越过读取边界，请刷新后重试");
      cursor = row.id;
    }
    documents.push(...page);
    if (documents.length > initialDocuments.total)
      throw new Error("读取期间文档超出初始分页范围，请刷新后重试");
    progress(
      `正在读取文档 · ${documents.length.toLocaleString()} / ${initialDocuments.total.toLocaleString()}`,
    );
  }
  const referencePairs = new Map<string, ReferenceRow>();
  let referenceCursor: string | null = null;
  let rawReferences = 0;
  while (
    initialReferences.high !== null &&
    referenceCursor !== initialReferences.high
  ) {
    const [window] = await sql<ReferenceWindow>(
      referenceWindowSql(referenceCursor, initialReferences.high),
      signal,
    );
    if (!window) throw new Error("引用分页结果不完整，请刷新后重试");
    const rows = decodeReferenceWindow(window);
    const total = checkedCount(window.total);
    if (total === 0) {
      if (window.high !== null) throw new Error("思源返回了无效的引用分页边界");
      break;
    }
    const next = checkedRowId(window.high);
    if (
      (referenceCursor !== null && BigInt(next) <= BigInt(referenceCursor)) ||
      BigInt(next) > BigInt(initialReferences.high)
    )
      throw new Error("引用分页未前进或越过读取边界，请刷新后重试");
    for (const row of rows) {
      const key = JSON.stringify([row.source, row.target]);
      const previous = referencePairs.get(key);
      if (previous)
        previous.weight = checkedCount(previous.weight + row.weight);
      else referencePairs.set(key, row);
    }
    referenceCursor = next;
    rawReferences = checkedCount(rawReferences + total);
    if (rawReferences > initialReferences.total)
      throw new Error("读取期间引用超出初始分页范围，请刷新后重试");
    progress(
      `正在聚合引用 · ${rawReferences.toLocaleString()} / ${initialReferences.total.toLocaleString()} 条 · ${referencePairs.size.toLocaleString()} 组关系`,
    );
  }
  const [finalDocuments, finalReferences] = await Promise.all([
    documentState(signal),
    referenceState(signal),
  ]);
  signal.throwIfAborted();
  const warnings: string[] = [];
  const documentsChanged =
    initialDocuments.total !== finalDocuments.total ||
    initialDocuments.last !== finalDocuments.last;
  // These separate statements detect count/high-watermark changes, but cannot
  // promise an atomic snapshot under same-count edits or rowid reuse/VACUUM.
  const referencesChanged =
    initialReferences.total !== finalReferences.total ||
    initialReferences.high !== finalReferences.high;
  if (!documentsChanged && documents.length !== initialDocuments.total)
    throw new Error("文档分页结果不完整，请刷新后重试");
  if (!referencesChanged && rawReferences !== initialReferences.total)
    throw new Error("引用分页结果不完整，请刷新后重试");
  if (documentsChanged || referencesChanged)
    warnings.push(
      "读取期间文档或引用发生变化，当前分页结果可能不完整，请刷新图谱获取最新数据。",
    );
  const graph = normalizeGraph(
    documents,
    [...referencePairs.values()],
    notebooks,
  );
  if (graph.skippedReferences > 0)
    warnings.push(
      `已省略 ${graph.skippedReferences.toLocaleString()} 条同文档或端点不可用的引用。`,
    );
  return {
    ...graph,
    notebooks,
    source: "siyuan",
    loadedAt: new Date().toISOString(),
    loadMs: performance.now() - started,
    warnings,
  };
}

export function createDemoGraph(count: number): GraphDataset {
  const started = performance.now();
  const topics = [
    "知识系统",
    "产品设计",
    "工程实践",
    "研究方法",
    "阅读笔记",
    "创作灵感",
    "生活记录",
    "项目档案",
  ];
  const notebooks = topics.map((name, index) => ({
    id: `demo-${index}`,
    name,
    color: PALETTE[index],
  }));
  const nodes: GraphNode[] = Array.from({ length: count }, (_, index) => ({
    id: `demo-${index}`,
    index,
    label: `${topics[index % topics.length]} · ${index + 1}`,
    notebook: notebooks[index % notebooks.length].id,
    color: PALETTE[index % PALETTE.length],
    path: "",
    degree: 0,
  }));
  const edges: GraphEdge[] = [];
  for (let index = 1; index < count; index++) {
    edges.push({
      source: Math.max(0, index - 8),
      target: index,
      kind: "hierarchy",
      weight: 1,
    });
    const target = Math.floor(index * 0.61803398875);
    if (target !== index)
      edges.push({ source: index, target, kind: "reference", weight: 1 });
    const crossTarget = (index * 7919) % count;
    if (index % 3 === 0 && crossTarget !== index)
      edges.push({
        source: index,
        target: crossTarget,
        kind: "reference",
        weight: 2,
      });
  }
  for (const edge of edges) {
    nodes[edge.source].degree++;
    nodes[edge.target].degree++;
  }
  const referenceCount = edges.reduce(
    (total, edge) => total + (edge.kind === "reference" ? edge.weight : 0),
    0,
  );
  return {
    nodes,
    edges,
    notebooks,
    source: "demo",
    loadedAt: new Date().toISOString(),
    loadMs: performance.now() - started,
    referenceCount,
    skippedReferences: 0,
    warnings: [],
  };
}
