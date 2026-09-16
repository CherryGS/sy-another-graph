import {
  message as msg,
  MessageError,
  failureOf,
  type Failure,
} from "../../../core/diagnostics/message";
import type { SourceProgress } from "../../../core/diagnostics/progress";
import { api } from "./api";
import {
  diagnosticValue,
  ReadDiagnosticError,
  ReadIssueCollector,
  type ReadIssue,
} from "../../../core/diagnostics/read-issues";
import type { BlockRow } from "./source";
import {
  type GraphDataset,
  type GraphEdge,
  type GraphNode,
  type GraphProvenance,
} from "../../../core/graph/types";

const MAX_DATABASES = 4096;
const MAX_ITEMS = 500_000;
const MAX_RELATIONS = 1_000_000;
const NATIVE_ID = /^\d{14}-[a-z0-9]{7}$/;

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

function invalid(message: Failure, path: string, value: unknown, expected: Failure): never {
  throw new ReadDiagnosticError(message, {
    "text.location": path,
    "text.actualValue": diagnosticValue(value),
    "text.expected": expected,
  });
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(msg("text.theDatabaseApiReturnedAnInvalidObject"), path, value, msg("text.object"));
  return value as Record<string, unknown>;
}

function nativeId(value: unknown, path: string): string {
  if (typeof value !== "string" || !NATIVE_ID.test(value))
    invalid(
      msg("text.theDatabaseApiReturnedAnInvalidId"),
      path,
      value,
      msg("text.nativeSiyuanId14DigitsAHyphenThen"),
    );
  return value;
}

/** AV field keys are opaque identifiers; imported keys need not be block IDs. */
function fieldId(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim())
    invalid(
      msg("text.theDatabaseApiReturnedAnInvalidFieldId"),
      path,
      value,
      msg("text.nonemptyStringFieldIdsNeedNotFollowThe"),
    );
  return value;
}

function values(value: unknown, path: string): unknown[] {
  // Go's omitempty removes an empty values array; null also represents empty.
  if (value == null) return [];
  if (!Array.isArray(value))
    invalid(
      msg("text.theDatabaseApiReturnedAnInvalidFieldValue"),
      path,
      value,
      msg("text.arrayOrOmittedNullForAnEmptyValue"),
    );
  return value;
}

function decodeDatabase(id: string, response: unknown): Database {
  const av = record(record(response, "data").av, "av");
  if (av.id !== id)
    invalid(msg("text.theDatabaseApiReturnedADifferentLogicalDatabase"), "av.id", av.id, id);
  if (!Array.isArray(av.keyValues))
    invalid(
      msg("text.theDatabaseApiDidNotReturnAComplete"),
      "av.keyValues",
      av.keyValues,
      msg("text.arrayOfFields"),
    );
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
      msg("text.theDatabaseHasNoUniquePrimaryItemField"),
      "av.keyValues",
      primaryFields.length,
      msg("text.exactlyOneFieldWithTypeBlock"),
    );
  const primary = primaryFields[0];
  if (primary.values.length > MAX_ITEMS)
    throw new MessageError(msg("text.aLogicalDatabaseExceedsTheItemReadLimit", { p0: MAX_ITEMS }));
  const items: DatabaseItem[] = [];
  const itemIds = new Set<string>();
  for (const [index, raw] of primary.values.entries()) {
    const path = `${primary.path}.values[${index}]`;
    const value = record(raw, path);
    const itemId = nativeId(value.blockID, `${path}.blockID`);
    const block = record(value.block, `${path}.block`);
    if (itemIds.has(itemId))
      invalid(
        msg("text.theDatabaseReturnedDuplicateItemIds"),
        `${path}.blockID`,
        itemId,
        msg("text.itemIdUniqueWithinTheDatabase"),
      );
    if (value.isDetached !== undefined && typeof value.isDetached !== "boolean")
      invalid(
        msg("text.theDatabaseReturnedAnInvalidItemBindingState"),
        `${path}.isDetached`,
        value.isDetached,
        msg("text.boolean"),
      );
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
      invalid(
        msg("text.theDatabaseReturnedDuplicateFieldIds"),
        `${field.path}.key.id`,
        keyId,
        msg("text.fieldIdUniqueWithinTheDatabase"),
      );
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
          throw new MessageError(
            msg("text.aLogicalDatabaseExceedsTheFieldRelationRead", { p0: MAX_RELATIONS }),
          );
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
    name: typeof av.name === "string" && av.name ? av.name : id,
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
  progress: (message: SourceProgress) => void,
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
          "text.containerBlockId": block.id,
          "text.sourceLocation": block.hpath || block.path,
          "text.containerContent": block.markdown ?? "",
          "text.reason": msg("text.missingRecognizableNodeattributeviewDataAvIdOrAn"),
        },
        openBlockId: block.id,
        openLabel: msg("text.openDatabaseContainer"),
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
    progress({ phase: "databases", completed: cursor + 1, total: queue.length });
    let database: Database;
    let databaseName: Failure = msg("text.nameUnavailable");
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
      const reason = failureOf(error);
      const origin = embeddings.get(id)?.[0];
      issues.add("database-read", {
        fields: {
          "text.database": databaseName,
          "text.databaseId": id,
          "text.api": "/api/av/getAttributeView",
          "text.reason": reason,
          ...(origin
            ? {
                "text.containerBlockId": origin.id,
                "text.sourceLocation": origin.humanPath || origin.path,
              }
            : { "text.discovery": msg("text.discoveredThroughAnotherDatabaseSRelationFieldNo") }),
          ...(error instanceof ReadDiagnosticError ? error.fields : {}),
        },
        openBlockId: origin?.id,
        openLabel: msg("text.openDatabaseSource"),
      });
      continue;
    }
    if (
      itemCount + database.items.length > MAX_ITEMS ||
      relationCount + database.relations.length > MAX_RELATIONS
    ) {
      issues.add("database-budget", {
        fields: {
          "text.database": database.name,
          "text.databaseId": id,
          "text.itemsRead": String(itemCount),
          "text.itemsInCurrentDatabase": String(database.items.length),
          "text.itemLimit": String(MAX_ITEMS),
          "text.fieldRelationsRead": String(relationCount),
          "text.fieldRelationsInCurrentDatabase": String(database.relations.length),
          "text.fieldRelationLimit": String(MAX_RELATIONS),
          "text.discoveredDatabasesOmitted": String(queue.length - cursor),
        },
        openBlockId: embeddings.get(id)?.[0]?.id,
        openLabel: msg("text.openDatabaseSource"),
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
        "text.triggeredLimit": msg("text.logicalDatabaseLimit"),
        "text.logicalDatabaseLimit2": String(MAX_DATABASES),
        "text.logicalDatabasesDiscovered": String(queue.length),
      },
    });

  const addNode = (node: Omit<GraphNode, "index">) => {
    const result = { ...node, index: nodes.length };
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
        label: item.label || bound?.label || "",
        content: item.label,
        entity: "database-item",
        databaseId: database.id,
        itemId: item.id,
        boundBlockId: item.boundBlockId,
        notebook: bound?.notebook ?? "",
        path: "",
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
            "text.database": database.name,
            "text.databaseId": database.id,
            "text.item2": item.label,
            "text.itemId": item.id,
            "text.boundBlockId": item.boundBlockId,
            "text.primaryField": database.primaryFieldName,
            "text.fieldId": database.primaryFieldId,
            "text.reason": msg("text.theItemDeclaresABoundBlockButIts"),
          },
          openBlockId,
          openLabel: msg("text.openDatabaseSource"),
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
            "text.database": database.name,
            "text.databaseId": database.id,
            "text.relationField2": relation.fieldName,
            "text.fieldId": relation.fieldId,
            "text.sourceItemId": relation.sourceItemId,
            "text.targetDatabaseId": relation.targetDatabaseId,
            "text.targetItemId": relation.targetItemId,
            "text.missingEndpoints": msg(
              !source && !target
                ? "diagnostics.missingBothItems"
                : !source
                  ? "text.sourceItem"
                  : "text.targetItem",
            ),
            "text.reason": msg("text.theReferencedItemIsAbsentFromTheSuccessfully"),
          },
          openBlockId: embeddings.get(database.id)?.[0]?.id,
          openLabel: msg("text.openDatabaseSource"),
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
  return { nodes, edges, warnings: issues.finish() };
}
