import { graphDegrees } from "../../../core/graph/metrics";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addDatabaseGraph } from "./database-source";
import type { BlockRow } from "./source";
import type { GraphEdge, GraphNode } from "../../../core/graph/types";

const id = (index: number) => `20260909120000-${String(index).padStart(7, "0")}`;
const AV_A = id(1);
const AV_B = id(2);
const FIELD_A = id(3);
const FIELD_B = id(4);
const RELATION = id(5);
const BACK_RELATION = id(6);
const BOUND_BLOCK = id(7);
const EMBEDDING_A = id(8);
const EMBEDDING_MIRROR = id(9);
const ITEM_A = id(10);
const ITEM_B = id(11);

afterEach(() => vi.unstubAllGlobals());

function block(blockId: string, type = "p", markdown = ""): BlockRow {
  return {
    id: blockId,
    type,
    content: `Block ${blockId}`,
    box: "notebook",
    path: "/document.sy",
    root_id: "document",
    parent_id: "document",
    markdown,
  };
}

function embedding(blockId = EMBEDDING_A, avId = AV_A) {
  return block(
    blockId,
    "av",
    `<div data-type="NodeAttributeView" data-av-id="${avId}" data-av-type="table"></div>\n{: id="${blockId}"}`,
  );
}

function baseGraph(blocks: BlockRow[]) {
  const nodes: GraphNode[] = blocks.map((source, index) => ({
    id: source.id,
    label: source.content,
    content: source.content,
    entity: "block",
    blockType: source.type,
    rootId: source.root_id,
    notebook: source.box,
    path: source.path,
    index,
    openBlockId: source.id,
  }));
  return { nodes, edges: [] };
}

function primary(itemId: string, boundBlockId?: string) {
  return {
    blockID: itemId,
    type: "block",
    isDetached: !boundBlockId,
    block: { id: boundBlockId, content: `Item ${itemId}` },
  };
}

function database(avId: string, primaryFieldId: string, items: unknown[], extra: unknown[] = []) {
  return {
    av: {
      id: avId,
      name: `Database ${avId}`,
      keyValues: [
        {
          key: { id: primaryFieldId, type: "block", name: "Item" },
          values: items,
        },
        ...extra,
      ],
      // A filtered or paginated view never determines logical DB membership.
      views: [
        {
          id: id(50),
          pageSize: 1,
          filters: [{ column: "hidden" }],
          table: { rows: [] },
        },
      ],
    },
  };
}

function relationField(targetDatabaseId = AV_B, targetItemId = ITEM_B) {
  return {
    key: {
      id: RELATION,
      name: "Related evidence",
      type: "relation",
      relation: {
        avID: targetDatabaseId,
        isTwoWay: true,
        backKeyID: BACK_RELATION,
      },
    },
    values: [
      {
        blockID: ITEM_A,
        relation: {
          blockIDs: [targetItemId, targetItemId],
          contents: [{ blockID: id(99) }],
        },
      },
    ],
  };
}

function mockDatabases(responses: Record<string, unknown>) {
  const fetchMock = vi.fn(async (path: string, request: RequestInit) => {
    request.signal?.throwIfAborted();
    // Acquisition must use the whole-database read, without render or mutation.
    expect(path).toBe("/api/av/getAttributeView");
    expect(request.method).toBe("POST");
    const body = JSON.parse(String(request.body));
    expect(Object.keys(body)).toEqual(["id"]);
    return Response.json({ code: 0, data: responses[body.id] ?? { av: null } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function acquire(blocks: BlockRow[]) {
  return addDatabaseGraph(baseGraph(blocks), blocks, new AbortController().signal, () => {});
}

describe("complete logical database acquisition", () => {
  it.each(["success", "failure", "cancelled"])(
    "preserves frozen native facts and shared evidence during %s",
    async (outcome) => {
      const blocks = [embedding(), block(BOUND_BLOCK)];
      const native: GraphEdge = {
        source: 1,
        target: 0,
        kind: "reference",
        weight: 2,
        provenance: [
          { sourceId: BOUND_BLOCK, targetId: EMBEDDING_A, kind: "reference", weight: 2 },
        ],
      };
      const base = { ...baseGraph(blocks), edges: [native] };
      base.nodes.forEach(Object.freeze);
      native.provenance!.forEach(Object.freeze);
      Object.freeze(native.provenance);
      Object.freeze(native);
      Object.freeze(base.nodes);
      Object.freeze(base.edges);
      const before = JSON.stringify(base);
      const controller = new AbortController();
      if (outcome === "success") mockDatabases({ [AV_A]: database(AV_A, FIELD_A, []) });
      else
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => {
            if (outcome === "cancelled") {
              controller.abort();
              throw controller.signal.reason;
            }
            throw new Error("Database unavailable");
          }),
        );
      const pending = addDatabaseGraph(base, blocks, controller.signal, () => {});
      if (outcome === "cancelled")
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      else {
        const result = await pending;
        expect(result.nodes[0]).not.toBe(base.nodes[0]);
        expect(result.nodes[0].databaseId).toBe(AV_A);
        expect(result.edges).not.toBe(base.edges);
        expect(result.edges[0]).toBe(native);
        expect(result.edges[0].provenance).toBe(native.provenance);
        expect(result.edges).toHaveLength(outcome === "success" ? 2 : 1);
        expect(result.warnings).toHaveLength(outcome === "success" ? 0 : 1);
      }
      expect(JSON.stringify(base)).toBe(before);
      expect(base.nodes[0].databaseId).toBeUndefined();
    },
  );

  it("leaves a graph without database blocks independent of AV APIs", async () => {
    const fetchMock = mockDatabases({});
    const blocks = [block(BOUND_BLOCK)];
    const base = baseGraph(blocks);
    const graph = await addDatabaseGraph(base, blocks, new AbortController().signal, () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(graph.nodes).toEqual(base.nodes);
    expect(graph.nodes[0]).not.toBe(base.nodes[0]);
    expect(graph.warnings).toEqual([]);
  });

  it("deduplicates mirrors and preserves bound, detached and filtered-out items with typed provenance", async () => {
    const fetchMock = mockDatabases({
      [AV_A]: database(
        AV_A,
        FIELD_A,
        [
          primary(ITEM_A, BOUND_BLOCK),
          ...Array.from({ length: 20 }, (_, i) => primary(id(100 + i))),
        ],
        [
          relationField(),
          {
            key: { id: id(40), type: "rollup" },
            values: [{ blockID: ITEM_A, rollup: { contents: [primary(id(98))] } }],
          },
          {
            key: { id: id(41), type: "text" },
            values: [{ blockID: ITEM_A, text: { content: AV_B } }],
          },
        ],
      ),
      [AV_B]: database(AV_B, FIELD_B, [primary(ITEM_B)]),
    });
    const blocks = [block(BOUND_BLOCK), embedding(), embedding(EMBEDDING_MIRROR)];
    const original = baseGraph(blocks);
    const originalCopy = structuredClone(original);
    const graph = await addDatabaseGraph(original, blocks, new AbortController().signal, () => {});
    expect(original).toEqual(originalCopy);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(graph.warnings).toEqual([]);
    expect(graph.nodes.filter((node) => node.entity === "database")).toHaveLength(2);
    expect(graph.nodes.filter((node) => node.entity === "database-item")).toHaveLength(22);
    const boundItem = graph.nodes.find((node) => node.id === `av-item:${AV_A}:${ITEM_A}`)!;
    expect(boundItem).toMatchObject({
      itemId: ITEM_A,
      databaseId: AV_A,
      boundBlockId: BOUND_BLOCK,
      openBlockId: BOUND_BLOCK,
    });
    expect(boundItem.rootId).toBeUndefined();
    expect(graph.nodes.find((node) => node.id === EMBEDDING_A)?.databaseId).toBe(AV_A);
    expect(graph.edges.filter((edge) => edge.kind === "database-embedding")).toHaveLength(2);
    expect(graph.edges.filter((edge) => edge.kind === "database-membership")).toHaveLength(22);
    expect(graph.edges.filter((edge) => edge.kind === "database-binding")).toHaveLength(1);
    const relations = graph.edges.filter((edge) => edge.kind === "database-relation");
    expect(relations).toHaveLength(1);
    expect(relations[0].provenance).toEqual([
      {
        sourceId: `av-item:${AV_A}:${ITEM_A}`,
        targetId: `av-item:${AV_B}:${ITEM_B}`,
        kind: "database-relation",
        weight: 1,
        databaseId: AV_A,
        sourceItemId: ITEM_A,
        targetItemId: ITEM_B,
        targetDatabaseId: AV_B,
        fieldId: RELATION,
        fieldName: "Related evidence",
        isTwoWay: true,
        pairedFieldId: BACK_RELATION,
      },
    ]);
    const target = graph.nodes[relations[0].target];
    expect(target.openBlockId).toBeUndefined();
    expect(target.rootId).toBeUndefined();
    expect([...graphDegrees(graph).values()].reduce((sum, degree) => sum + degree, 0)).toBe(
      2 * graph.edges.length,
    );
  });

  it("uses the embedding as detached-item context, never an item ID as a block ID", async () => {
    const detached = primary(ITEM_A);
    // A stale block.id must not change the explicit detached state.
    detached.block.id = BOUND_BLOCK;
    mockDatabases({ [AV_A]: database(AV_A, FIELD_A, [detached]) });
    const graph = await acquire([embedding(), block(BOUND_BLOCK)]);
    const item = graph.nodes.find((node) => node.itemId === ITEM_A)!;
    expect(item.openBlockId).toBe(EMBEDDING_A);
    expect(item.boundBlockId).toBeUndefined();
    expect(item.rootId).toBeUndefined();
    expect(graph.edges.some((edge) => edge.kind === "database-binding")).toBe(false);
  });

  it("terminates cyclic relation targets and only emits relations actually stored in fields", async () => {
    const backField = relationField(AV_A, ITEM_A);
    backField.key.id = BACK_RELATION;
    backField.values[0].blockID = ITEM_B;
    mockDatabases({
      [AV_A]: database(AV_A, FIELD_A, [primary(ITEM_A)], [relationField()]),
      [AV_B]: database(AV_B, FIELD_B, [primary(ITEM_B)], [backField]),
    });
    const graph = await acquire([embedding()]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(graph.edges.filter((edge) => edge.kind === "database-relation")).toHaveLength(2);
  });

  it("keeps a real item whose bound block is unavailable and reports missing endpoints", async () => {
    mockDatabases({
      [AV_A]: database(AV_A, FIELD_A, [primary(ITEM_A, BOUND_BLOCK)], [relationField()]),
    });
    const graph = await acquire([embedding()]);
    expect(graph.nodes.some((node) => node.itemId === ITEM_A)).toBe(true);
    expect(graph.nodes.some((node) => node.id === BOUND_BLOCK)).toBe(false);
    expect(graph.nodes.some((node) => node.itemId === ITEM_B)).toBe(false);
    expect(
      graph.edges.some(
        (edge) => edge.kind === "database-binding" || edge.kind === "database-relation",
      ),
    ).toBe(false);
    expect(JSON.stringify(graph.warnings)).toContain(AV_B);
    expect(JSON.stringify(graph.warnings)).toContain("database-bindings");
    expect(JSON.stringify(graph.warnings)).toContain("database-relations");
  });

  it("does not invent items from dangling relation values, even when target display content exists", async () => {
    mockDatabases({
      [AV_A]: database(AV_A, FIELD_A, [], [relationField()]),
      [AV_B]: database(AV_B, FIELD_B, []),
    });
    const graph = await acquire([embedding()]);
    expect(graph.nodes.filter((node) => node.entity === "database-item")).toHaveLength(0);
    expect(graph.edges.filter((edge) => edge.kind === "database-relation")).toHaveLength(0);
    expect(JSON.stringify(graph.warnings)).toContain("database-relations");
  });

  it("accepts omitted empty values and ignores unconfigured relation columns", async () => {
    mockDatabases({
      [AV_A]: {
        av: {
          id: AV_A,
          name: "Empty",
          keyValues: [
            { key: { id: FIELD_A, type: "block" } },
            { key: { id: RELATION, type: "relation", relation: { avID: "" } } },
          ],
        },
      },
    });
    const graph = await acquire([embedding()]);
    expect(graph.nodes.filter((node) => node.entity === "database")).toHaveLength(1);
    expect(graph.warnings).toEqual([]);
  });

  it("accepts opaque imported field IDs, including the primary and paired relation keys", async () => {
    const relation = relationField();
    relation.key.id = "mcq1ziy5-related";
    relation.key.relation.backKeyID = "legacy-back-key";
    mockDatabases({
      [AV_A]: database(
        AV_A,
        "mcq1ziy5-primary",
        [primary(ITEM_A)],
        [relation, { key: { id: "imported-url-key", type: "url" } }],
      ),
      [AV_B]: database(AV_B, "legacy-primary", [primary(ITEM_B)]),
    });
    const graph = await acquire([embedding()]);
    expect(graph.warnings).toEqual([]);
    expect(
      graph.edges.find((edge) => edge.kind === "database-relation")?.provenance?.[0],
    ).toMatchObject({ fieldId: "mcq1ziy5-related", pairedFieldId: "legacy-back-key" });
    expect(
      graph.edges.find((edge) => edge.kind === "database-membership")?.provenance?.[0].fieldId,
    ).toBe("mcq1ziy5-primary");
  });

  it("reports the exact invalid native binding location, actual value, database and available source", async () => {
    mockDatabases({ [AV_A]: database(AV_A, FIELD_A, [primary(ITEM_A, "not-a-block-id")]) });
    const graph = await acquire([embedding()]);
    expect(graph.warnings[0]).toMatchObject({
      code: "database-read",
      count: 1,
      details: [
        {
          fields: {
            "text.databaseId": AV_A,
            "text.api": "/api/av/getAttributeView",
            "text.location": "av.keyValues[0].values[0].block.id",
            "text.actualValue": "not-a-block-id",
          },
          openBlockId: EMBEDDING_A,
        },
      ],
    });
  });

  it("retains endpoint identities and the binding impact in read diagnostics", async () => {
    mockDatabases({
      [AV_A]: database(AV_A, FIELD_A, [primary(ITEM_A, BOUND_BLOCK)], [relationField()]),
    });
    const graph = await acquire([embedding()]);
    expect(
      graph.warnings.find((issue) => issue.code === "database-bindings")?.details[0].fields,
    ).toMatchObject({ "text.itemId": ITEM_A, "text.boundBlockId": BOUND_BLOCK });
    expect(
      graph.warnings.find((issue) => issue.code === "database-relations")?.details[0].fields,
    ).toMatchObject({
      "text.sourceItemId": ITEM_A,
      "text.targetItemId": ITEM_B,
      "text.targetDatabaseId": AV_B,
    });
  });

  it("reports an invalid logical payload and continues with another independent database", async () => {
    mockDatabases({
      [AV_A]: database(AV_A, FIELD_A, [primary(ITEM_A), primary(ITEM_A)]),
      [AV_B]: database(AV_B, FIELD_B, [primary(ITEM_B)]),
    });
    const graph = await acquire([embedding(), embedding(EMBEDDING_MIRROR, AV_B)]);
    expect(graph.nodes.some((node) => node.id === `av:${AV_A}`)).toBe(false);
    expect(graph.nodes.some((node) => node.itemId === ITEM_B)).toBe(true);
    expect(JSON.stringify(graph.warnings)).toContain("text.theDatabaseReturnedDuplicateItemIds");
  });

  it("recognizes formatter attributes without confusing bindings or quoted attribute content", async () => {
    const blocks = [
      block(
        EMBEDDING_A,
        "av",
        `<div title='data-av-id="${AV_A}"' data-type="NodeAttributeView"></div>`,
      ),
      { ...block(BOUND_BLOCK), ial: `{: custom-avs="${AV_A}"}` },
      block(
        EMBEDDING_MIRROR,
        "av",
        `<div data-av-id='${AV_B}' data-type='NodeAttributeView'></div>`,
      ),
    ];
    const fetchMock = mockDatabases({ [AV_B]: database(AV_B, FIELD_B, []) });
    const graph = await acquire(blocks);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(graph.warnings)).toContain("database-identifier");
    expect(graph.nodes.find((node) => node.id === BOUND_BLOCK)?.databaseId).toBeUndefined();
  });

  it("propagates cancellation instead of claiming an aborted read was a partial successful graph", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        controller.abort(new DOMException("Cancelled", "AbortError"));
        throw controller.signal.reason;
      }),
    );
    const blocks = [embedding()];
    await expect(
      addDatabaseGraph(baseGraph(blocks), blocks, controller.signal, () => {}),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports truncation when database discovery exceeds the request budget", async () => {
    const blocks = Array.from({ length: 4097 }, (_, index) =>
      embedding(id(10000 + index), id(20000 + index)),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, request: RequestInit) => {
        const body = JSON.parse(String(request.body));
        return Response.json({ code: 0, data: database(body.id, FIELD_A, []) });
      }),
    );
    const graph = await acquire(blocks);
    expect(fetch).toHaveBeenCalledTimes(4096);
    expect(graph.nodes.filter((node) => node.entity === "database")).toHaveLength(4096);
    expect(JSON.stringify(graph.warnings)).toContain("text.logicalDatabaseLimit");
    expect(graph.warnings[0]).toMatchObject({ code: "database-budget", count: 1 });
  });
});
