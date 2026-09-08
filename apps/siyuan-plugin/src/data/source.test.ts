import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, loadSiYuanGraph, normalizeGraph, type BlockRow } from "./source";

const databases: DatabaseSync[] = [];
const documentId = (index: number) => `doc-${String(index).padStart(6, "0")}`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const database of databases.splice(0)) database.close();
});

function databaseFixture(count: number, includeReferences = true) {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  database.exec(
    "CREATE TABLE blocks(id TEXT PRIMARY KEY, box TEXT, path TEXT, hpath TEXT, content TEXT, type TEXT, root_id TEXT, parent_id TEXT, ial TEXT, markdown TEXT); CREATE TABLE refs(block_id TEXT, def_block_id TEXT, root_id TEXT, def_block_root_id TEXT)",
  );
  const addDocument = database.prepare(
    "INSERT INTO blocks(id, box, path, content, type) VALUES (?, ?, ?, ?, ?)",
  );
  const addReference = database.prepare(
    "INSERT INTO refs(block_id, def_block_id) VALUES (?, ?)",
  );
  database.exec("BEGIN");
  for (let index = 0; index < count; index++) {
    const id = documentId(index);
    addDocument.run(id, "book", `/${id}.sy`, `Document ${index}`, "d");
    if (includeReferences) {
      addReference.run(id, documentId((index + 1) % count));
      addReference.run(id, documentId((index + 1) % count));
      addReference.run(id, documentId((index + 17) % count));
    }
  }
  database.exec("COMMIT");
  return database;
}

interface ApiHarnessOptions {
  pageSize?: number;
  beforeQuery?: (statement: string) => void;
  overridePage?: (
    statement: string,
    rows: Record<string, unknown>[],
  ) => Record<string, unknown>[];
}

function mockSiYuan(database: DatabaseSync, options: ApiHarnessOptions = {}) {
  const statements: string[] = [];
  const referenceBatchRows: number[] = [];
  const mock = vi.fn(async (path: string, request: RequestInit) => {
    request.signal?.throwIfAborted();
    if (path === "/api/notebook/lsNotebooks") {
      return Response.json({
        code: 0,
        data: {
          notebooks: [
            { id: "book", name: "Book" },
            { id: "closed", name: "Closed", closed: true },
          ],
        },
      });
    }
    expect(path).toBe("/api/query/sql");
    const body = JSON.parse(String(request.body)) as {
      stmt: string;
      mode: string;
    };
    expect(body.mode).toBe("readonly");
    statements.push(body.stmt);
    options.beforeQuery?.(body.stmt);
    let rows = database.prepare(body.stmt).all();
    if (
      body.stmt.startsWith("SELECT id, box") ||
      body.stmt.startsWith("SELECT json_group_array")
    ) {
      rows = rows.slice(0, options.pageSize ?? 1000);
      rows = (options.overridePage?.(body.stmt, rows) as typeof rows) ?? rows;
    }
    if (body.stmt.startsWith("SELECT json_group_array") && rows[0])
      referenceBatchRows.push(Number(rows[0].total));
    return Response.json({ code: 0, data: rows });
  });
  vi.stubGlobal("fetch", mock);
  return { mock, statements, referenceBatchRows };
}

function stalledFetch(_path: unknown, request: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    request.signal?.throwIfAborted();
    request.signal?.addEventListener(
      "abort",
      () => reject(request.signal?.reason),
      { once: true },
    );
  });
}

describe("SiYuan source block graph", () => {
  it("retains actual reference endpoints, including self references, and document parents", () => {
    const graph = normalizeGraph(
      [
        { id: "b", content: "Child", box: "book", path: "/a/b.sy" },
        { id: "a", content: "Parent", box: "book", path: "/a.sy" },
      ],
      [
        { source: "b", target: "a", weight: 7 },
        { source: "a", target: "a", weight: 2 },
        { source: "missing", target: "a", weight: 1 },
      ],
      [{ id: "book", name: "Book", color: "#fff" }],
    );
    expect(graph.nodes.map((node) => node.id)).toEqual(["a", "b"]);
    expect(graph.edges).toMatchObject([
      { source: 1, target: 0, kind: "reference", weight: 7 },
      { source: 0, target: 0, kind: "reference", weight: 2 },
      { source: 0, target: 1, kind: "hierarchy", weight: 1 },
    ]);
    expect(graph.skippedReferences).toBe(1);
  });

  it("uses native indexed parents and retains block, document, and heading context", () => {
    const makeBlock = (
      id: string,
      type: string,
      parent_id: string,
      content = id,
    ): BlockRow => ({
      id,
      type,
      parent_id,
      content,
      root_id: "doc",
      box: "book",
      path: "/doc.sy",
    });
    const sourceText = `A passage ${"with source context ".repeat(12)}`;
    const graph = normalizeGraph(
      [
        makeBlock("doc", "d", "", "Document title"),
        makeBlock("heading", "h", "doc", "Section title"),
        makeBlock("list", "l", "heading"),
        makeBlock("passage", "p", "list", sourceText),
        makeBlock("target", "p", "heading"),
        makeBlock("unknown", "future-block-type", "doc", ""),
      ],
      [{ source: "passage", target: "target", weight: 2 }],
      [],
    );
    const passage = graph.nodes.find((node) => node.id === "passage")!;
    expect(passage).toMatchObject({
      entity: "block",
      blockType: "p",
      rootId: "doc",
      parentId: "list",
      documentLabel: "Document title",
      heading: "Section title",
      content: sourceText,
      openBlockId: "passage",
    });
    expect(passage.label).toHaveLength(101);
    expect(graph.nodes.find((node) => node.id === "unknown")).toMatchObject({
      entity: "block",
      blockType: "future-block-type",
      label: "块 unknown",
    });
    const facts = graph.edges.map((edge) => edge.provenance?.[0]);
    expect(facts).toContainEqual({
      sourceId: "passage",
      targetId: "target",
      kind: "reference",
      weight: 2,
    });
    expect(facts).toContainEqual({
      sourceId: "list",
      targetId: "passage",
      kind: "hierarchy",
      weight: 1,
    });
    expect(facts).not.toContainEqual({
      sourceId: "doc",
      targetId: "passage",
      kind: "hierarchy",
      weight: 1,
    });
    expect(graph.referenceCount).toBe(2);
    expect(graph.skippedReferences).toBe(0);
  });

  it("does not fabricate a document or loop indefinitely for incomplete parent context", () => {
    const graph = normalizeGraph(
      [
        {
          id: "a",
          type: "p",
          root_id: "unavailable",
          parent_id: "b",
          content: "A",
          box: "book",
          path: "/unavailable.sy",
        },
        {
          id: "b",
          type: "s",
          root_id: "unavailable",
          parent_id: "a",
          content: "B",
          box: "book",
          path: "/unavailable.sy",
        },
      ],
      [],
      [],
    );
    expect(graph.nodes).toHaveLength(2);
    expect(
      graph.nodes.every(
        (node) =>
          node.documentLabel === undefined && node.heading === undefined,
      ),
    ).toBe(true);
  });

  it.each([false, true])(
    "retains full heading ancestry when ancestors sort before or after descendants (%s)",
    (ancestorFirst) => {
      const outer = ancestorFirst ? "a-outer" : "z-outer";
      const inner = ancestorFirst ? "b-inner" : "y-inner";
      const passage = ancestorFirst ? "z-passage" : "a-passage";
      const row = (
        id: string,
        type: string,
        parent_id: string,
        content: string,
      ): BlockRow => ({
        id,
        type,
        parent_id,
        content,
        root_id: "doc",
        box: "book",
        path: "/doc.sy",
        hpath: "/Research/Repeated document title",
      });
      const input = [
        row("doc", "d", "", "Repeated document title"),
        row(outer, "h", "doc", "Outer section"),
        row("unknown-container", "future-type", outer, "Container"),
        row(inner, "h", "unknown-container", "Inner section"),
        row(passage, "p", inner, "Passage"),
        row("sibling", "p", outer, "Sibling passage"),
      ];
      for (const rows of [input, input.slice().reverse()]) {
        const graph = normalizeGraph(rows, [], []);
        expect(graph.nodes.find((node) => node.id === passage)).toMatchObject({
          heading: "Outer section › Inner section",
          humanPath: "/Research/Repeated document title",
          path: "/doc.sy",
        });
        expect(graph.nodes.find((node) => node.id === inner)?.heading).toBe(
          "Outer section › Inner section",
        );
        expect(graph.nodes.find((node) => node.id === outer)?.heading).toBe(
          "Outer section",
        );
        expect(graph.nodes.find((node) => node.id === "sibling")?.heading).toBe(
          "Outer section",
        );
        expect(
          graph.nodes.find((node) => node.id === "unknown-container"),
        ).toMatchObject({
          blockType: "future-type",
          heading: "Outer section",
        });
      }
    },
  );

  it("does not fabricate a heading path from a cycle or a different document's ancestor", () => {
    const row = (
      id: string,
      type: string,
      parent_id: string,
      root_id = "doc",
    ): BlockRow => ({
      id,
      type,
      parent_id,
      root_id,
      content: id,
      box: "book",
      path: `/${root_id}.sy`,
    });
    const graph = normalizeGraph(
      [
        row("a-heading", "h", "b-container"),
        row("b-container", "future-type", "a-heading"),
        row("c-passage", "p", "a-heading"),
        row("d-heading", "h", "b-container"),
        row("other-heading", "h", "other-doc", "other-doc"),
        row("local-heading", "h", "other-heading"),
        row("local-passage", "p", "local-heading"),
      ],
      [],
      [],
    );
    for (const id of ["a-heading", "b-container", "c-passage", "d-heading"])
      expect(
        graph.nodes.find((node) => node.id === id)?.heading,
      ).toBeUndefined();
    expect(
      graph.nodes.find((node) => node.id === "local-passage")?.heading,
    ).toBe("local-heading");
  });
});

describe("SiYuan keyset pagination through the API", () => {
  it("reads every block type and uses block reference endpoints even inside one document", async () => {
    const database = databaseFixture(1, false);
    const doc = documentId(0);
    const insert = database.prepare(
      "INSERT INTO blocks(id, box, path, content, type, root_id, parent_id, ial, markdown) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    insert.run(
      "heading",
      "book",
      `/${doc}.sy`,
      "Heading",
      "h",
      doc,
      doc,
      "",
      "",
    );
    insert.run(
      "paragraph",
      "book",
      `/${doc}.sy`,
      "Citing passage",
      "p",
      doc,
      "heading",
      "",
      "",
    );
    insert.run(
      "superblock",
      "book",
      `/${doc}.sy`,
      "Container",
      "s",
      doc,
      doc,
      "",
      "",
    );
    insert.run(
      "unknown",
      "book",
      `/${doc}.sy`,
      "Future kind",
      "new-kind",
      doc,
      "superblock",
      "",
      "",
    );
    database.prepare("UPDATE blocks SET hpath = ?").run("/Research/Document 0");
    const reference = database.prepare(
      "INSERT INTO refs(block_id, def_block_id, root_id, def_block_root_id) VALUES (?, ?, ?, ?)",
    );
    reference.run("paragraph", "unknown", doc, doc);
    reference.run("paragraph", doc, doc, doc);
    reference.run(doc, "paragraph", doc, doc);
    mockSiYuan(database, { pageSize: 2 });
    const graph = await loadSiYuanGraph(new AbortController().signal, () => {});
    expect(graph.nodes).toHaveLength(5);
    expect(graph.nodes.map((node) => node.blockType)).toEqual([
      "d",
      "h",
      "p",
      "s",
      "new-kind",
    ]);
    const references = graph.edges.filter((edge) => edge.kind === "reference");
    expect(references).toHaveLength(3);
    expect(references.flatMap((edge) => edge.provenance ?? [])).toEqual(
      expect.arrayContaining([
        {
          sourceId: "paragraph",
          targetId: "unknown",
          kind: "reference",
          weight: 1,
        },
        { sourceId: "paragraph", targetId: doc, kind: "reference", weight: 1 },
        { sourceId: doc, targetId: "paragraph", kind: "reference", weight: 1 },
      ]),
    );
    expect(graph.nodes.find((node) => node.id === "paragraph")).toMatchObject({
      rootId: doc,
      parentId: "heading",
      heading: "Heading",
      documentLabel: "Document 0",
      humanPath: "/Research/Document 0",
      path: `/${doc}.sy`,
    });
    expect(graph.referenceCount).toBe(3);
    expect(graph.skippedReferences).toBe(0);
    expect(graph.warnings).toEqual([]);
  });

  it("reads more than 1000 blocks and reference groups even when every server page is short", async () => {
    const database = databaseFixture(1057);
    const { statements } = mockSiYuan(database, { pageSize: 127 });
    const graph = await loadSiYuanGraph(new AbortController().signal, () => {});
    expect(graph.nodes).toHaveLength(1057);
    expect(graph.edges).toHaveLength(2114);
    expect(graph.referenceCount).toBe(3171);
    expect(graph.skippedReferences).toBe(0);
    expect(graph.warnings).toEqual([]);
    expect(graph.notebooks.map((book) => book.id)).toEqual(["book"]);
    expect(graph.nodes[0].humanPath).toBeUndefined();
    expect(
      statements.filter((stmt) => stmt.startsWith("SELECT id, box")),
    ).toHaveLength(9);
    expect(
      statements.filter((stmt) => stmt.startsWith("SELECT json_group_array")),
    ).toHaveLength(1);
    expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(1057);
  });

  it("rejects an early empty block page when counts stayed unchanged", async () => {
    const database = databaseFixture(1200);
    let pages = 0;
    mockSiYuan(database, {
      pageSize: 300,
      overridePage: (stmt, rows) =>
        stmt.startsWith("SELECT id, box") && ++pages === 2 ? [] : rows,
    });
    await expect(
      loadSiYuanGraph(new AbortController().signal, () => {}),
    ).rejects.toThrow("块分页结果不完整");
  });

  it("rejects an early empty reference page instead of publishing missing edges", async () => {
    const database = databaseFixture(2000);
    let pages = 0;
    mockSiYuan(database, {
      pageSize: 300,
      overridePage: (stmt, rows) =>
        stmt.startsWith("SELECT json_group_array") && ++pages === 2 ? [] : rows,
    });
    await expect(
      loadSiYuanGraph(new AbortController().signal, () => {}),
    ).rejects.toThrow("引用分页结果不完整");
  });

  it("rejects a repeated short page before it can loop or duplicate nodes", async () => {
    const database = databaseFixture(10, false);
    let firstPage: Record<string, unknown>[] | undefined;
    const { statements } = mockSiYuan(database, {
      pageSize: 3,
      overridePage: (stmt, rows) => {
        if (!stmt.startsWith("SELECT id, box")) return rows;
        firstPage ??= rows;
        return firstPage;
      },
    });
    await expect(
      loadSiYuanGraph(new AbortController().signal, () => {}),
    ).rejects.toThrow("块分页未前进");
    expect(
      statements.filter((stmt) => stmt.startsWith("SELECT id, box")),
    ).toHaveLength(2);
  });

  it("detects same-count replacement when a new row appears behind the cursor", async () => {
    const database = databaseFixture(20, false);
    let pages = 0;
    mockSiYuan(database, {
      pageSize: 5,
      beforeQuery: (stmt) => {
        if (!stmt.startsWith("SELECT id, box") || ++pages !== 2) return;
        database.prepare("DELETE FROM blocks WHERE id = ?").run(documentId(10));
        database
          .prepare(
            "INSERT INTO blocks(id, box, path, content, type) VALUES (?, ?, ?, ?, ?)",
          )
          .run(
            "before-cursor",
            "book",
            "/before-cursor.sy",
            "Replacement",
            "d",
          );
      },
    });
    await expect(
      loadSiYuanGraph(new AbortController().signal, () => {}),
    ).rejects.toThrow("块分页结果不完整");
  });

  it("bounds continuous appends by the initial key without imposing a graph capacity cap", async () => {
    const database = databaseFixture(101, false);
    let pages = 0;
    mockSiYuan(database, {
      pageSize: 20,
      beforeQuery: (stmt) => {
        if (!stmt.startsWith("SELECT id, box")) return;
        const id = `new-${++pages}`;
        database
          .prepare(
            "INSERT INTO blocks(id, box, path, content, type) VALUES (?, ?, ?, ?, ?)",
          )
          .run(id, "book", `/${id}.sy`, "New", "d");
      },
    });
    const graph = await loadSiYuanGraph(new AbortController().signal, () => {});
    expect(pages).toBe(6);
    expect(graph.nodes).toHaveLength(101);
    expect(graph.warnings.some((warning) => warning.includes("发生变化"))).toBe(
      true,
    );
  });

  it("notices reference weight changes even when pair count is unchanged", async () => {
    const database = databaseFixture(2000);
    let pages = 0;
    mockSiYuan(database, {
      pageSize: 40,
      beforeQuery: (stmt) => {
        if (stmt.startsWith("SELECT json_group_array") && ++pages === 2)
          database
            .prepare("INSERT INTO refs(block_id, def_block_id) VALUES (?, ?)")
            .run(documentId(0), documentId(1));
      },
    });
    const graph = await loadSiYuanGraph(new AbortController().signal, () => {});
    expect(graph.referenceCount).toBe(6000);
    expect(graph.warnings.some((warning) => warning.includes("发生变化"))).toBe(
      true,
    );
  });

  it("accounts for missing and empty reference endpoints without losing their weights", async () => {
    const database = databaseFixture(2, false);
    const insert = database.prepare(
      "INSERT INTO refs(block_id, def_block_id) VALUES (?, ?)",
    );
    insert.run("", documentId(0));
    insert.run("missing", documentId(1));
    insert.run(documentId(0), documentId(0));
    mockSiYuan(database, { pageSize: 1 });
    const graph = await loadSiYuanGraph(new AbortController().signal, () => {});
    expect(graph.referenceCount).toBe(3);
    expect(graph.skippedReferences).toBe(2);
    expect(graph.edges).toMatchObject([
      { source: 0, target: 0, kind: "reference", weight: 1 },
    ]);
    expect(
      graph.warnings.some((warning) => warning.includes("端点不可用")),
    ).toBe(true);
  });

  it("loads a genuinely empty workspace without requesting data pages", async () => {
    const database = databaseFixture(0);
    const { statements } = mockSiYuan(database);
    const graph = await loadSiYuanGraph(new AbortController().signal, () => {});
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.warnings).toEqual([]);
    expect(
      statements.some(
        (stmt) =>
          stmt.startsWith("SELECT id, box") ||
          stmt.startsWith("SELECT json_group_array"),
      ),
    ).toBe(false);
  });

  it("merges more than 1000 duplicate pairs across raw windows without losing weights", async () => {
    const database = databaseFixture(1500, false);
    const insert = database.prepare(
      "INSERT INTO refs(block_id, def_block_id) VALUES (?, ?)",
    );
    database.exec("BEGIN");
    for (let repeat = 0; repeat < 3; repeat++) {
      for (let index = 0; index < 1500; index++)
        insert.run(documentId(index), documentId((index + 1) % 1500));
    }
    database.exec("COMMIT");
    const { referenceBatchRows } = mockSiYuan(database, { pageSize: 127 });
    const graph = await loadSiYuanGraph(new AbortController().signal, () => {});
    expect(referenceBatchRows).toEqual([4096, 404]);
    expect(graph.edges).toHaveLength(1500);
    expect(graph.edges.every((edge) => edge.weight === 3)).toBe(true);
    expect(graph.referenceCount).toBe(4500);
    expect(graph.warnings).toEqual([]);
  });

  it("preserves signed 64-bit rowids including values above JavaScript safe integers", async () => {
    const database = databaseFixture(2, false);
    const insert = database.prepare(
      "INSERT INTO refs(rowid, block_id, def_block_id) VALUES (?, ?, ?)",
    );
    insert.run(-9223372036854775808n, documentId(0), documentId(1));
    database.exec("BEGIN");
    for (let index = 0; index < 5000; index++)
      insert.run(
        9007199254740993n + BigInt(index),
        documentId(0),
        documentId(1),
      );
    database.exec("COMMIT");
    const { referenceBatchRows } = mockSiYuan(database);
    const graph = await loadSiYuanGraph(new AbortController().signal, () => {});
    expect(referenceBatchRows).toEqual([4096, 905]);
    expect(graph.edges).toMatchObject([
      { source: 0, target: 1, kind: "reference", weight: 5001 },
    ]);
    expect(graph.referenceCount).toBe(5001);
    expect(graph.warnings).toEqual([]);
  });

  it("rejects a truncated aggregate payload before advancing its raw cursor", async () => {
    const database = databaseFixture(10);
    mockSiYuan(database, {
      overridePage: (stmt, rows) => {
        if (!stmt.startsWith("SELECT json_group_array")) return rows;
        const groups = JSON.parse(String(rows[0].groups)) as unknown[];
        return [{ ...rows[0], groups: JSON.stringify(groups.slice(1)) }];
      },
    });
    await expect(
      loadSiYuanGraph(new AbortController().signal, () => {}),
    ).rejects.toThrow("不完整的引用批次");
  });

  it("rejects repeated raw windows instead of double-counting their groups", async () => {
    const database = databaseFixture(2000);
    let firstWindow: Record<string, unknown>[] | undefined;
    mockSiYuan(database, {
      overridePage: (stmt, rows) => {
        if (!stmt.startsWith("SELECT json_group_array")) return rows;
        firstWindow ??= rows;
        return firstWindow;
      },
    });
    await expect(
      loadSiYuanGraph(new AbortController().signal, () => {}),
    ).rejects.toThrow("引用分页未前进");
  });

  it("uses bounded indexed rowid scans for more than 100000 raw references", async () => {
    const database = databaseFixture(35_000);
    database.exec(
      "CREATE INDEX idx_refs_def_block_id ON refs(def_block_id); CREATE INDEX idx_refs_def_block_root_id ON refs(def_block_root_id)",
    );
    const { statements, referenceBatchRows } = mockSiYuan(database);
    const graph = await loadSiYuanGraph(new AbortController().signal, () => {});
    expect(graph.referenceCount).toBe(105_000);
    expect(graph.edges).toHaveLength(70_000);
    expect(referenceBatchRows.reduce((sum, count) => sum + count, 0)).toBe(
      105_000,
    );
    expect(
      referenceBatchRows.every((count) => count > 0 && count <= 4096),
    ).toBe(true);
    const pages = statements.filter((stmt) =>
      stmt.startsWith("SELECT json_group_array"),
    );
    expect(pages).toHaveLength(26);
    for (const statement of pages) {
      const plan = database
        .prepare(`EXPLAIN QUERY PLAN ${statement}`)
        .all()
        .map((row) => String(row.detail));
      expect(
        plan.some((detail) =>
          detail.includes("SEARCH refs USING INTEGER PRIMARY KEY"),
        ),
      ).toBe(true);
      expect(plan.some((detail) => detail.startsWith("SCAN refs"))).toBe(false);
    }
  });

  it("keeps block keyset queries indexed under the actual SiYuan blocks schema", async () => {
    const database = new DatabaseSync(":memory:");
    databases.push(database);
    database.exec(`CREATE TABLE blocks (id, parent_id, root_id, hash, box, path, hpath, name, alias, memo, tag, content, fcontent, markdown, length, type, subtype, ial, sort, created, updated);
      CREATE INDEX idx_blocks_id ON blocks(id);
      CREATE INDEX idx_blocks_parent_id ON blocks(parent_id);
      CREATE INDEX idx_blocks_root_id ON blocks(root_id);
      CREATE INDEX idx_blocks_root_id_id_hash ON blocks(root_id, id, hash);
      CREATE INDEX idx_blocks_doc_hpath ON blocks(hpath) WHERE type = 'd';
      CREATE TABLE refs (block_id, def_block_id, root_id, def_block_root_id)`);
    const insert = database.prepare(
      "INSERT INTO blocks(id, box, path, hpath, content, type) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (let index = 0; index < 3; index++)
      insert.run(
        documentId(index),
        "book",
        `/${documentId(index)}.sy`,
        `/Topic ${index}/Document`,
        "Document",
        "d",
      );
    const { statements } = mockSiYuan(database, { pageSize: 1 });
    const graph = await loadSiYuanGraph(new AbortController().signal, () => {});
    expect(graph.nodes.map((node) => node.humanPath)).toEqual([
      "/Topic 0/Document",
      "/Topic 1/Document",
      "/Topic 2/Document",
    ]);
    expect(graph.nodes.map((node) => node.path)).toEqual(
      [0, 1, 2].map((index) => `/${documentId(index)}.sy`),
    );
    for (const statement of statements.filter((stmt) =>
      stmt.startsWith("SELECT id, box"),
    )) {
      const plan = database
        .prepare(`EXPLAIN QUERY PLAN ${statement}`)
        .all()
        .map((row) => String(row.detail));
      expect(
        plan.some((detail) =>
          detail.includes("SEARCH blocks USING INDEX idx_blocks_id"),
        ),
      ).toBe(true);
      expect(plan.some((detail) => detail.includes("TEMP B-TREE"))).toBe(false);
    }
  });
});

describe("SiYuan request failure and cancellation", () => {
  it("does not issue requests for an already aborted load", async () => {
    const fetch = vi.fn(stalledFetch);
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    controller.abort(new Error("Cancelled by user"));
    await expect(loadSiYuanGraph(controller.signal, () => {})).rejects.toThrow(
      "Cancelled by user",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels all active reads and never publishes a cancelled graph", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((path: unknown, request: RequestInit) => {
        signals.push(request.signal!);
        return stalledFetch(path, request);
      }),
    );
    const controller = new AbortController();
    const load = loadSiYuanGraph(controller.signal, () => {});
    const rejected = expect(load).rejects.toThrow("Cancelled by user");
    expect(signals).toHaveLength(3);
    controller.abort(new Error("Cancelled by user"));
    await rejected;
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("aborts sibling reads when another parallel request fails", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((path: unknown, request: RequestInit) => {
        signals.push(request.signal!);
        if (String(request.body).includes("max(id)"))
          return Promise.resolve(
            Response.json({ code: -1, msg: "Database unavailable" }),
          );
        return stalledFetch(path, request);
      }),
    );
    await expect(
      loadSiYuanGraph(new AbortController().signal, () => {}),
    ).rejects.toThrow("Database unavailable");
    expect(signals.filter((signal) => signal.aborted)).toHaveLength(2);
  });

  it("applies a per-request timeout and releases its timer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(stalledFetch));
    const pending = api("/api/query/sql", {});
    const rejected = expect(pending).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects HTTP failures and malformed envelopes", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    fetch.mockResolvedValueOnce(new Response("", { status: 503 }));
    await expect(api("/api/query/sql", {})).rejects.toThrow("HTTP 503");
    fetch.mockResolvedValueOnce(Response.json({ data: [] }));
    await expect(api("/api/query/sql", {})).rejects.toThrow("无效数据");
  });
});
