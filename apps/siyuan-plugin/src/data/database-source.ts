import { api } from "./api";
import {
  diagnosticValue,
  ReadDiagnosticError,
  ReadIssueCollector,
  type ReadIssue,
} from "./read-issues";
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
const itemNodeId = (databaseId: string, id: string) => `av-item:${databaseId}:${id}`;

function invalid(message: string, path: string, value: unknown, expected: string): never {
  throw new ReadDiagnosticError(message, {
    位置: path,
    实际值: diagnosticValue(value),
    期望: expected,
  });
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("数据库接口返回了无效对象", path, value, "对象");
  return value as Record<string, unknown>;
}

function nativeId(value: unknown, path: string): string {
  if (typeof value !== "string" || !NATIVE_ID.test(value))
    invalid(
      "数据库接口返回了无效标识",
      path,
      value,
      "思源原生 ID（14 位数字、连字符、7 位字母或数字）",
    );
  return value;
}

/** AV field keys are opaque identifiers; imported keys need not be block IDs. */
function fieldId(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim())
    invalid(
      "数据库接口返回了无效字段标识",
      path,
      value,
      "非空字符串（字段 ID 不要求思源块 ID 格式）",
    );
  return value;
}

function values(value: unknown, path: string): unknown[] {
  // Go's omitempty removes an empty values array; null also represents empty.
  if (value == null) return [];
  if (!Array.isArray(value))
    invalid("数据库接口返回了无效字段值", path, value, "数组，或省略/null 表示空值");
  return value;
}

function decodeDatabase(id: string, response: unknown): Database {
  const av = record(record(response, "data").av, "av");
  if (av.id !== id) invalid("数据库接口返回的逻辑库不匹配", "av.id", av.id, id);
  if (!Array.isArray(av.keyValues))
    invalid("数据库接口未返回完整逻辑库", "av.keyValues", av.keyValues, "字段数组");
  const fields = av.keyValues.map((entry, index) => {
    const path = `av.keyValues[${index}]`;
    const field = record(entry, path);
    return {
      path,
      key: record(field.key, `${path}.key`),
      values: values(field.values, `${path}.values`),
    };
  });
  const primaryFields = fields.filter(({ key }) => key.type === "block");
  if (primaryFields.length !== 1)
    invalid(
      "数据库缺少唯一的条目主键字段",
      "av.keyValues",
      primaryFields.length,
      "恰好 1 个 type=block 字段",
    );
  const primary = primaryFields[0];
  if (primary.values.length > MAX_ITEMS)
    throw new Error(`单个逻辑库超过 ${MAX_ITEMS.toLocaleString()} 个条目的读取上限`);
  const items: DatabaseItem[] = [];
  const itemIds = new Set<string>();
  for (const [index, raw] of primary.values.entries()) {
    const path = `${primary.path}.values[${index}]`;
    const value = record(raw, path);
    const itemId = nativeId(value.blockID, `${path}.blockID`);
    const block = record(value.block, `${path}.block`);
    if (itemIds.has(itemId))
      invalid("数据库返回了重复条目标识", `${path}.blockID`, itemId, "库内唯一条目 ID");
    if (value.isDetached !== undefined && typeof value.isDetached !== "boolean")
      invalid("数据库返回了无效条目绑定状态", `${path}.isDetached`, value.isDetached, "布尔值");
    itemIds.add(itemId);
    items.push({
      id: itemId,
      label: typeof block.content === "string" ? block.content : "",
      // isDetached is authoritative, even when stale data carries a block.id.
      boundBlockId: value.isDetached ? undefined : nativeId(block.id, `${path}.block.id`),
    });
  }
  const relations: DatabaseRelation[] = [];
  const targets = new Set<string>();
  const fieldIds = new Set<string>();
  for (const field of fields) {
    const keyId = fieldId(field.key.id, `${field.path}.key.id`);
    if (fieldIds.has(keyId))
      invalid("数据库返回了重复字段标识", `${field.path}.key.id`, keyId, "库内唯一字段 ID");
    fieldIds.add(keyId);
    if (field.key.type !== "relation") continue;
    // An unconfigured relation field has no target and declares no edge.
    if (field.key.relation == null) continue;
    const config = record(field.key.relation, `${field.path}.key.relation`);
    if (config.avID === "" || config.avID == null) continue;
    const targetDatabaseId = nativeId(config.avID, `${field.path}.key.relation.avID`);
    targets.add(targetDatabaseId);
    const seen = new Set<string>();
    for (const [index, raw] of field.values.entries()) {
      const path = `${field.path}.values[${index}]`;
      const value = record(raw, path);
      if (value.relation == null) continue;
      const relation = record(value.relation, `${path}.relation`);
      const sourceItemId = nativeId(value.blockID, `${path}.blockID`);
      for (const [targetIndex, rawTarget] of values(
        relation.blockIDs,
        `${path}.relation.blockIDs`,
      ).entries()) {
        const targetItemId = nativeId(rawTarget, `${path}.relation.blockIDs[${targetIndex}]`);
        const key = `${sourceItemId}:${targetItemId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (relations.length >= MAX_RELATIONS)
          throw new Error(`单个逻辑库超过 ${MAX_RELATIONS.toLocaleString()} 条字段关联的读取上限`);
        relations.push({
          sourceItemId,
          targetItemId,
          targetDatabaseId,
          fieldId: keyId,
          fieldName: typeof field.key.name === "string" ? field.key.name : "",
          isTwoWay: config.isTwoWay === true,
          pairedFieldId: config.backKeyID
            ? fieldId(config.backKeyID, `${field.path}.key.relation.backKeyID`)
            : undefined,
        });
      }
    }
  }
  return {
    id,
    name: typeof av.name === "string" && av.name ? av.name : "未命名数据库",
    primaryFieldId: fieldId(primary.key.id, `${primary.path}.key.id`),
    primaryFieldName: typeof primary.key.name === "string" ? primary.key.name : "",
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
  if (!opening || attribute(opening, "data-type") !== "NodeAttributeView") return undefined;
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
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; warnings: ReadIssue[] }> {
  signal.throwIfAborted();
  const nodes = base.nodes.map((node) => ({ ...node }));
  const edges = base.edges.map((edge) => ({
    ...edge,
    provenance: edge.provenance?.map((source) => ({ ...source })),
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const embeddings = new Map<string, GraphNode[]>();
  const issues = new ReadIssueCollector();
  for (const block of blocks) {
    if (block.type !== "av") continue;
    const node = byId.get(block.id);
    if (!node) continue;
    const id = embeddingDatabaseId(block);
    if (!id) {
      issues.add("database-identifier", {
        fields: {
          "载体块 ID": block.id,
          来源位置: block.hpath || block.path,
          载体内容: block.markdown ?? "",
          原因: "缺少可识别的 NodeAttributeView/data-av-id，或逻辑库 ID 格式不符",
        },
        openBlockId: block.id,
        openLabel: "打开数据库载体",
      });
      continue;
    }
    node.databaseId = id;
    const existing = embeddings.get(id);
    if (existing) existing.push(node);
    else embeddings.set(id, [node]);
  }
  const queue = [...embeddings.keys()];
  const scheduled = new Set(queue);
  const databases: Database[] = [];
  let itemCount = 0;
  let relationCount = 0;
  // One in-flight request bounds whole-database response memory and respects
  // cancellation between databases. A visited set also terminates relation cycles.
  for (let cursor = 0; cursor < queue.length && cursor < MAX_DATABASES; cursor++) {
    signal.throwIfAborted();
    const id = queue[cursor];
    progress(`正在读取数据库 · ${cursor + 1} / ${queue.length}`);
    let database: Database;
    let databaseName = "（名称不可用）";
    try {
      const response = await api<{ av?: { name?: unknown } } | null>(
        "/api/av/getAttributeView",
        { id },
        signal,
      );
      if (typeof response?.av?.name === "string") databaseName = response.av.name;
      database = decodeDatabase(id, response);
    } catch (error) {
      signal.throwIfAborted();
      const reason = error instanceof Error ? error.message : "接口请求失败";
      const origin = embeddings.get(id)?.[0];
      issues.add("database-read", {
        fields: {
          数据库: databaseName,
          "数据库 ID": id,
          接口: "/api/av/getAttributeView",
          原因: reason,
          ...(origin
            ? { "载体块 ID": origin.id, 来源位置: origin.humanPath || origin.path }
            : { 发现方式: "由其他数据库的关联字段发现，本次没有可用载体" }),
          ...(error instanceof ReadDiagnosticError ? error.fields : {}),
        },
        openBlockId: origin?.id,
        openLabel: "打开数据库来源",
      });
      continue;
    }
    if (
      itemCount + database.items.length > MAX_ITEMS ||
      relationCount + database.relations.length > MAX_RELATIONS
    ) {
      issues.add("database-budget", {
        fields: {
          数据库: database.name,
          "数据库 ID": id,
          已读取条目: String(itemCount),
          当前库条目: String(database.items.length),
          条目上限: String(MAX_ITEMS),
          已读取字段关联: String(relationCount),
          当前库字段关联: String(database.relations.length),
          字段关联上限: String(MAX_RELATIONS),
          未加入已发现数据库: String(queue.length - cursor),
        },
        openBlockId: embeddings.get(id)?.[0]?.id,
        openLabel: "打开数据库来源",
      });
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
    issues.add("database-budget", {
      fields: {
        触发限制: "逻辑库的上限",
        逻辑库上限: String(MAX_DATABASES),
        已发现逻辑库: String(queue.length),
      },
    });

  const addNode = (node: Omit<GraphNode, "index" | "degree">) => {
    const result = { ...node, index: nodes.length, degree: 0 };
    nodes.push(result);
    byId.set(result.id, result);
    return result;
  };
  const addEdge = (source: GraphNode, target: GraphNode, provenance: GraphProvenance) => {
    edges.push({
      source: source.index,
      target: target.index,
      kind: provenance.kind,
      weight: 1,
      provenance: [provenance],
    });
  };
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
      else if (item.boundBlockId)
        issues.add("database-bindings", {
          fields: {
            数据库: database.name,
            "数据库 ID": database.id,
            条目: item.label,
            "条目 ID": item.id,
            "绑定块 ID": item.boundBlockId,
            主键字段: database.primaryFieldName,
            "字段 ID": database.primaryFieldId,
            原因: "该条目声明了绑定块，但本次读取的块索引中没有该 ID",
          },
          openBlockId,
          openLabel: "打开数据库来源",
        });
    }
  }
  for (const database of databases) {
    signal.throwIfAborted();
    for (const relation of database.relations) {
      const source = byId.get(itemNodeId(database.id, relation.sourceItemId));
      const target = byId.get(itemNodeId(relation.targetDatabaseId, relation.targetItemId));
      if (!source || !target) {
        issues.add("database-relations", {
          fields: {
            数据库: database.name,
            "数据库 ID": database.id,
            关联字段: relation.fieldName,
            "字段 ID": relation.fieldId,
            "来源条目 ID": relation.sourceItemId,
            "目标数据库 ID": relation.targetDatabaseId,
            "目标条目 ID": relation.targetItemId,
            缺失端点: [!source ? "来源条目" : "", !target ? "目标条目" : ""]
              .filter(Boolean)
              .join("、"),
            原因: "关联字段指向的条目未出现在本次成功读取的逻辑库中",
          },
          openBlockId: embeddings.get(database.id)?.[0]?.id,
          openLabel: "打开数据库来源",
        });
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
  for (const node of nodes) node.degree = 0;
  for (const edge of edges) {
    nodes[edge.source].degree++;
    nodes[edge.target].degree++;
  }
  return { nodes, edges, warnings: issues.finish() };
}
