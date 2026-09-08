import { api } from "./api";
import type { BlockRow } from "./source";
import {
  PALETTE,
  type GraphDataset,
  type GraphEdge,
  type GraphNode,
  type GraphProvenance,
} from "./types";

const MAX_DATABASES = 4096;
const MAX_ITEMS = 500_000;
const MAX_RELATIONS = 1_000_000;
const NATIVE_ID = /^\d{14}-[a-z0-9]{7}$/;
const DATABASE_COLOR = PALETTE[2];

interface DatabaseItem {
  id: string;
  label: string;
  boundBlockId?: string;
}

interface DatabaseRelation {
  sourceItemId: string;
  targetItemId: string;
  targetDatabaseId: string;
  fieldId: string;
  fieldName: string;
  isTwoWay: boolean;
  pairedFieldId?: string;
}

interface Database {
  id: string;
  name: string;
  primaryFieldId: string;
  primaryFieldName: string;
  items: DatabaseItem[];
  relations: DatabaseRelation[];
  targetDatabaseIds: string[];
}

const databaseNodeId = (id: string) => `av:${id}`;
const itemNodeId = (databaseId: string, id: string) =>
  `av-item:${databaseId}:${id}`;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("数据库接口返回了无效对象");
  return value as Record<string, unknown>;
}

function nativeId(value: unknown): string {
  if (typeof value !== "string" || !NATIVE_ID.test(value))
    throw new Error("数据库接口返回了无效标识");
  return value;
}

function values(value: unknown): unknown[] {
  // Go's omitempty removes an empty values array; null also represents empty.
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("数据库接口返回了无效字段值");
  return value;
}

function decodeDatabase(id: string, response: unknown): Database {
  const av = record(record(response).av);
  if (av.id !== id || !Array.isArray(av.keyValues))
    throw new Error("数据库接口未返回完整逻辑库");
  const fields = av.keyValues.map((entry) => {
    const field = record(entry);
    return { key: record(field.key), values: values(field.values) };
  });
  const primaryFields = fields.filter(({ key }) => key.type === "block");
  if (primaryFields.length !== 1)
    throw new Error("数据库缺少唯一的条目主键字段");
  const primary = primaryFields[0];
  if (primary.values.length > MAX_ITEMS)
    throw new Error(
      `单个逻辑库超过 ${MAX_ITEMS.toLocaleString()} 个条目的读取上限`,
    );
  const items: DatabaseItem[] = [];
  const itemIds = new Set<string>();
  for (const raw of primary.values) {
    const value = record(raw);
    const itemId = nativeId(value.blockID);
    const block = record(value.block);
    if (itemIds.has(itemId)) throw new Error("数据库返回了重复条目标识");
    if (value.isDetached !== undefined && typeof value.isDetached !== "boolean")
      throw new Error("数据库返回了无效条目绑定状态");
    itemIds.add(itemId);
    items.push({
      id: itemId,
      label: typeof block.content === "string" ? block.content : "",
      // isDetached is authoritative, even when stale data carries a block.id.
      boundBlockId: value.isDetached ? undefined : nativeId(block.id),
    });
  }
  const relations: DatabaseRelation[] = [];
  const targets = new Set<string>();
  const fieldIds = new Set<string>();
  for (const field of fields) {
    const fieldId = nativeId(field.key.id);
    if (fieldIds.has(fieldId)) throw new Error("数据库返回了重复字段标识");
    fieldIds.add(fieldId);
    if (field.key.type !== "relation") continue;
    // An unconfigured relation field has no target and declares no edge.
    if (field.key.relation == null) continue;
    const config = record(field.key.relation);
    if (config.avID === "" || config.avID == null) continue;
    const targetDatabaseId = nativeId(config.avID);
    targets.add(targetDatabaseId);
    const seen = new Set<string>();
    for (const raw of field.values) {
      const value = record(raw);
      if (value.relation == null) continue;
      const relation = record(value.relation);
      const sourceItemId = nativeId(value.blockID);
      for (const rawTarget of values(relation.blockIDs)) {
        const targetItemId = nativeId(rawTarget);
        const key = `${sourceItemId}:${targetItemId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (relations.length >= MAX_RELATIONS)
          throw new Error(
            `单个逻辑库超过 ${MAX_RELATIONS.toLocaleString()} 条字段关联的读取上限`,
          );
        relations.push({
          sourceItemId,
          targetItemId,
          targetDatabaseId,
          fieldId,
          fieldName: typeof field.key.name === "string" ? field.key.name : "",
          isTwoWay: config.isTwoWay === true,
          pairedFieldId: config.backKeyID
            ? nativeId(config.backKeyID)
            : undefined,
        });
      }
    }
  }
  return {
    id,
    name: typeof av.name === "string" && av.name ? av.name : "未命名数据库",
    primaryFieldId: nativeId(primary.key.id),
    primaryFieldName:
      typeof primary.key.name === "string" ? primary.key.name : "",
    items,
    relations,
    targetDatabaseIds: [...targets],
  };
}

function attribute(source: string, name: string): string | undefined {
  // Tokenize quoted attributes so a name inside another value cannot match.
  const attributes = /(?:^|\s)([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(attributes))
    if (match[1] === name) return match[2] ?? match[3];
  return undefined;
}

function embeddingDatabaseId(block: BlockRow): string | undefined {
  if (block.type !== "av") return undefined;
  // SiYuan's pinned Lute formatter stores NodeAttributeView as this HTML div.
  const opening = block.markdown?.match(/^\s*<div\b([^>]*)>/i)?.[1];
  if (!opening || attribute(opening, "data-type") !== "NodeAttributeView")
    return undefined;
  const id = attribute(opening, "data-av-id");
  return id && NATIVE_ID.test(id) ? id : undefined;
}

/**
 * Read entire logical AVs, starting at the acquired database blocks and following
 * explicit relation-field targets. /api/av/getAttributeView returns keyValues
 * without applying a display view's filters, context filters, or pagination.
 * It does not render/create a missing AV or persist database settings.
 * Upstream contract: siyuan-note/siyuan@8641553a1f07374001902d3ce773285db1292b2d,
 * kernel/api/av.go getAttributeView; kernel/model/attribute_view.go
 * NewAttributeViewData; kernel/av/value.go Value and ValueRelation.
 */
export async function addDatabaseGraph(
  base: Pick<GraphDataset, "nodes" | "edges">,
  blocks: readonly BlockRow[],
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; warnings: string[] }> {
  signal.throwIfAborted();
  const nodes = base.nodes.map((node) => ({ ...node }));
  const edges = base.edges.map((edge) => ({
    ...edge,
    provenance: edge.provenance?.map((source) => ({ ...source })),
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const embeddings = new Map<string, GraphNode[]>();
  let missingEmbeddings = 0;
  for (const block of blocks) {
    if (block.type !== "av") continue;
    const node = byId.get(block.id);
    if (!node) continue;
    const id = embeddingDatabaseId(block);
    if (!id) {
      missingEmbeddings++;
      continue;
    }
    node.databaseId = id;
    const existing = embeddings.get(id);
    if (existing) existing.push(node);
    else embeddings.set(id, [node]);
  }
  const warnings: string[] = [];
  if (missingEmbeddings)
    warnings.push(
      `无法识别 ${missingEmbeddings.toLocaleString()} 个数据库块的逻辑库标识，数据库关系可能不完整。`,
    );
  const queue = [...embeddings.keys()];
  const scheduled = new Set(queue);
  const databases: Database[] = [];
  let itemCount = 0;
  let relationCount = 0;
  // One in-flight request bounds whole-database response memory and respects
  // cancellation between databases. A visited set also terminates relation cycles.
  for (
    let cursor = 0;
    cursor < queue.length && cursor < MAX_DATABASES;
    cursor++
  ) {
    signal.throwIfAborted();
    const id = queue[cursor];
    progress(`正在读取数据库 · ${cursor + 1} / ${queue.length}`);
    let database: Database;
    try {
      database = decodeDatabase(
        id,
        await api<unknown>("/api/av/getAttributeView", { id }, signal),
      );
    } catch (error) {
      signal.throwIfAborted();
      const reason = error instanceof Error ? error.message : "接口请求失败";
      warnings.push(
        `数据库 ${id} 未能完整读取：${reason}。相关连接可能不完整。`,
      );
      continue;
    }
    if (
      itemCount + database.items.length > MAX_ITEMS ||
      relationCount + database.relations.length > MAX_RELATIONS
    ) {
      warnings.push(
        `数据库关系达到本次读取上限（${MAX_ITEMS.toLocaleString()} 个条目、${MAX_RELATIONS.toLocaleString()} 条字段关联）；数据库 ${id} 及后续数据库未加入，当前图谱不完整。`,
      );
      break;
    }
    itemCount += database.items.length;
    relationCount += database.relations.length;
    databases.push(database);
    for (const target of database.targetDatabaseIds) {
      if (scheduled.has(target)) continue;
      scheduled.add(target);
      queue.push(target);
    }
  }
  if (queue.length > MAX_DATABASES)
    warnings.push(
      `数据库读取达到 ${MAX_DATABASES.toLocaleString()} 个逻辑库的上限，当前数据库关系不完整。`,
    );

  const addNode = (node: Omit<GraphNode, "index" | "degree">) => {
    const result = { ...node, index: nodes.length, degree: 0 };
    nodes.push(result);
    byId.set(result.id, result);
    return result;
  };
  const addEdge = (
    source: GraphNode,
    target: GraphNode,
    provenance: GraphProvenance,
  ) => {
    edges.push({
      source: source.index,
      target: target.index,
      kind: provenance.kind,
      weight: 1,
      provenance: [provenance],
    });
  };
  let missingBindings = 0;
  for (const database of databases) {
    signal.throwIfAborted();
    const databaseEmbeddings = embeddings.get(database.id) ?? [];
    const openBlockId = databaseEmbeddings[0]?.id;
    const databaseNode = addNode({
      id: databaseNodeId(database.id),
      label: database.name,
      content: database.name,
      entity: "database",
      databaseId: database.id,
      notebook: "",
      path: "",
      color: DATABASE_COLOR,
      openBlockId,
    });
    for (const embedding of databaseEmbeddings)
      addEdge(embedding, databaseNode, {
        sourceId: embedding.id,
        targetId: databaseNode.id,
        kind: "database-embedding",
        weight: 1,
        databaseId: database.id,
      });
    for (const item of database.items) {
      const bound = item.boundBlockId ? byId.get(item.boundBlockId) : undefined;
      const node = addNode({
        id: itemNodeId(database.id, item.id),
        label: item.label || bound?.label || "未命名条目",
        content: item.label,
        entity: "database-item",
        databaseId: database.id,
        itemId: item.id,
        boundBlockId: item.boundBlockId,
        notebook: bound?.notebook ?? "",
        path: "",
        color: bound?.color ?? DATABASE_COLOR,
        openBlockId: bound?.id ?? openBlockId,
      });
      addEdge(databaseNode, node, {
        sourceId: databaseNode.id,
        targetId: node.id,
        kind: "database-membership",
        weight: 1,
        databaseId: database.id,
        targetItemId: item.id,
        fieldId: database.primaryFieldId,
        fieldName: database.primaryFieldName,
      });
      if (bound)
        addEdge(node, bound, {
          sourceId: node.id,
          targetId: bound.id,
          kind: "database-binding",
          weight: 1,
          databaseId: database.id,
          sourceItemId: item.id,
          fieldId: database.primaryFieldId,
          fieldName: database.primaryFieldName,
        });
      else if (item.boundBlockId) missingBindings++;
    }
  }
  let missingRelations = 0;
  for (const database of databases) {
    signal.throwIfAborted();
    for (const relation of database.relations) {
      const source = byId.get(itemNodeId(database.id, relation.sourceItemId));
      const target = byId.get(
        itemNodeId(relation.targetDatabaseId, relation.targetItemId),
      );
      if (!source || !target) {
        missingRelations++;
        continue;
      }
      addEdge(source, target, {
        sourceId: source.id,
        targetId: target.id,
        kind: "database-relation",
        weight: 1,
        databaseId: database.id,
        ...relation,
      });
    }
  }
  if (missingBindings)
    warnings.push(
      `${missingBindings.toLocaleString()} 个数据库条目的绑定块不在当前读取范围内，已保留真实条目并省略不可用的绑定连接。`,
    );
  if (missingRelations)
    warnings.push(
      `${missingRelations.toLocaleString()} 条数据库字段关联的实际条目端点不可用，已省略这些连接；数据库关系可能不完整。`,
    );
  for (const node of nodes) node.degree = 0;
  for (const edge of edges) {
    nodes[edge.source].degree++;
    nodes[edge.target].degree++;
  }
  return { nodes, edges, warnings };
}
