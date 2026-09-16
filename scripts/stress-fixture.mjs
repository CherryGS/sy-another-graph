/**
 * Developer-only, append-only SiYuan pressure fixture. No plugin imports this file.
 * node scripts/stress-fixture.mjs --plan
 * node scripts/stress-fixture.mjs --init --workspace E:/Data/SYTest --notebook <fixture-id> --stamp <YYYYMMDDHHMMSS>
 * node scripts/stress-fixture.mjs --write --pilot
 * node scripts/stress-fixture.mjs --write --target 1000
 * node scripts/stress-fixture.mjs --report
 * The default state file, atlas-stress.local, is ignored by the delivery repo.
 * Kernel contracts: SiYuan 3.8.3 / upstream 8641553, docs/API.md; native writes
 * use createNotebook/createDocWithMd only, with read-only SQL verification.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve, win32 } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { BATCH_BLOCKS, makeFixtureDocument, planStages } from "./stress-fixture-data.mjs";

const ID = /^\d{14}-[a-z0-9]{7}$/;
const quote = (text) => `'${String(text).replaceAll("'", "''")}'`;
const normalizedWorkspace = (value) =>
  win32
    .normalize(value)
    .replace(/[\\/]+$/, "")
    .toLowerCase();
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

function saveState(path, state) {
  const temporary = `${path}.pending.local`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporary, path);
}

export async function main(argv = process.argv.slice(2)) {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      plan: { type: "boolean" },
      init: { type: "boolean" },
      write: { type: "boolean" },
      pilot: { type: "boolean" },
      report: { type: "boolean" },
      target: { type: "string" },
      workspace: { type: "string" },
      notebook: { type: "string" },
      stamp: { type: "string" },
      state: { type: "string", default: "atlas-stress.local" },
      url: { type: "string", default: "http://127.0.0.1:6806" },
    },
  });
  if (options.plan) {
    emit({
      mode: "dry-run",
      stages: planStages(),
      note: "Payload sizes exclude kernel storage, indexes, API envelopes, and renderer memory.",
    });
    return;
  }
  const statePath = resolve(options.state);
  let state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;
  if (state) assert.equal(state.schema, "atlas-stress-v1", "Refusing an unrelated state file");
  const workspace = options.workspace ?? state?.workspace;
  assert.ok(workspace, "Pass the explicitly authorized test workspace with --workspace");
  const origin = new URL(options.url);
  assert.ok(
    origin.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname),
    "Fixture writes require an explicit local kernel origin",
  );
  assert.equal(origin.pathname, "/", "The kernel URL must be an origin");
  assert.equal(
    origin.username + origin.password + origin.search + origin.hash,
    "",
    "Do not pass credentials or tokens in the kernel URL",
  );
  const timings = {};
  const abort = new AbortController();
  const interrupt = () =>
    abort.abort(
      new Error("Interrupted; pending writes will be reconciled by read-only queries on resume"),
    );
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const api = async (path, body = {}) => {
    abort.signal.throwIfAborted();
    const started = performance.now();
    try {
      const response = await fetch(new URL(path, origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(120_000)]),
      });
      assert.ok(response.ok, `${path} returned HTTP ${response.status}`);
      const envelope = await response.json();
      assert.equal(envelope.code, 0, `${path}: ${envelope.msg || "kernel error"}`);
      return envelope.data;
    } finally {
      const metric = (timings[path] ??= { requests: 0, ms: 0 });
      metric.requests++;
      metric.ms += Math.round(performance.now() - started);
    }
  };
  const sql = async (stmt) => {
    assert.ok(/^SELECT\b/.test(stmt), "Fixture verification is SELECT-only");
    const rows = await api("/api/query/sql", { stmt, mode: "readonly" });
    assert.ok(Array.isArray(rows), "SQL response must be rows");
    return rows;
  };
  try {
    const info = await api("/api/system/getWorkspaceInfo");
    assert.equal(
      normalizedWorkspace(info.workspaceDir),
      normalizedWorkspace(workspace),
      "Kernel workspace does not match the explicitly selected test workspace",
    );
    assert.equal(
      info.siyuanVer,
      "3.8.3",
      "This fixture's native serialization was verified on SiYuan 3.8.3; validate another kernel before writing",
    );
    if (options.init) {
      assert.equal(state, null, "A state file already exists; resume it instead of reinitializing");
      const stamp = options.stamp ?? new Date().toISOString().replace(/\D/g, "").slice(0, 14);
      assert.match(stamp, /^\d{14}$/);
      const books = (await api("/api/notebook/lsNotebooks")).notebooks;
      let book;
      if (options.notebook) {
        assert.match(options.notebook, ID);
        book = books.find((candidate) => candidate.id === options.notebook);
        assert.ok(
          book && book.name.startsWith("Atlas Stress "),
          "Only an explicitly selected dedicated Atlas Stress notebook can be adopted",
        );
      } else {
        assert.ok(options.write, "Creating a fixture notebook requires --write");
        const name = `Atlas Stress ${stamp}`;
        assert.ok(
          !books.some((candidate) => candidate.name === name),
          "A notebook with this fixture name already exists; inspect and explicitly adopt it",
        );
        book = (await api("/api/notebook/createNotebook", { name })).notebook;
      }
      assert.match(book.id, ID);
      const rows = await sql(
        `SELECT id FROM blocks WHERE box=${quote(book.id)} AND type IN ('p','h') ORDER BY id LIMIT 100`,
      );
      state = {
        schema: "atlas-stress-v1",
        workspace: info.workspaceDir,
        version: info.siyuanVer,
        notebook: book.id,
        notebookName: book.name,
        stamp,
        nextBatch: 0,
        corpusExists: false,
        anchors: rows.map((row) => row.id),
        documents: [],
        createdAt: new Date().toISOString(),
      };
      saveState(statePath, state);
      emit({
        event: "initialized",
        notebook: state.notebook,
        notebookName: state.notebookName,
        statePath,
      });
      return;
    }
    assert.ok(state, "Initialize a dedicated notebook/state with --init before writing stages");
    assert.equal(normalizedWorkspace(state.workspace), normalizedWorkspace(workspace));
    assert.match(state.notebook, ID);
    assert.match(state.stamp, /^\d{14}$/);
    const book = (await api("/api/notebook/lsNotebooks")).notebooks.find(
      (candidate) => candidate.id === state.notebook,
    );
    assert.ok(
      book && book.name === state.notebookName && !book.closed,
      "Fixture notebook must be present, unchanged, and open",
    );
    const snapshot = async () => {
      const [counts] = await sql(
        `SELECT count(*) AS blocks, sum(type='d') AS documents FROM blocks WHERE box=${quote(state.notebook)} LIMIT 1`,
      );
      const [relations] = await sql(
        `SELECT count(*) AS refs, sum(r.block_id=r.def_block_id) AS selfRefs, sum(r.root_id=r.def_block_root_id) AS intraDocRefs, sum(r.root_id<>r.def_block_root_id) AS crossDocRefs FROM refs r JOIN blocks b ON b.id=r.block_id WHERE b.box=${quote(state.notebook)} LIMIT 1`,
      );
      const types = await sql(
        `SELECT type, count(*) AS total FROM blocks WHERE box=${quote(state.notebook)} GROUP BY type ORDER BY type LIMIT 100`,
      );
      return { ...counts, ...relations, types };
    };
    if (options.report || !options.write) {
      emit({
        event: "report",
        notebook: state.notebook,
        ...(await snapshot()),
        pending: state.pending ? { path: state.pending.path, batch: state.pending.batch } : null,
      });
      return;
    }
    const verifyDocument = async (document, docId) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const [blocks] = await sql(
          `SELECT count(*) AS total, sum(id IN (${document.ownedIds.map(quote).join(",")})) AS owned FROM blocks WHERE root_id=${quote(docId)} AND box=${quote(state.notebook)} LIMIT 1`,
        );
        const [refs] = await sql(
          `SELECT count(*) AS total FROM refs WHERE root_id=${quote(docId)} LIMIT 1`,
        );
        if (
          Number(blocks.total) === document.expectedDocumentBlocks &&
          Number(blocks.owned) === document.ownedIds.length &&
          Number(refs.total) === document.expectedReferences
        )
          return;
        if (attempt === 19)
          throw new Error(
            `Native fixture verification failed for ${docId}: blocks ${blocks.total}/${document.expectedDocumentBlocks}, owned IDs ${blocks.owned}/${document.ownedIds.length}, indexed refs ${refs.total}/${document.expectedReferences}. No more documents were created.`,
          );
        await delay(250);
        await api("/api/sqlite/flushTransaction");
      }
    };
    const completeDocument = async (document, docId, recovered = false) => {
      assert.match(docId, ID);
      await api("/api/sqlite/flushTransaction");
      await verifyDocument(document, docId);
      state.documents.push({
        batch: document.batch,
        id: docId,
        path: document.path,
        expectedDocumentBlocks: document.expectedDocumentBlocks,
        expectedReferences: document.expectedReferences,
        markdownBytes: document.markdownBytes,
        anchors: document.anchors,
        verifiedAt: new Date().toISOString(),
      });
      state.anchors.push(...document.anchors);
      state.nextBatch = document.batch + 1;
      if (document.path.startsWith("/Corpus/")) state.corpusExists = true;
      delete state.pending;
      saveState(statePath, state);
      emit({
        event: recovered ? "reconciled" : "document",
        batch: document.batch,
        docId,
        blocks: document.expectedDocumentBlocks,
        refs: document.expectedReferences,
        markdownBytes: document.markdownBytes,
      });
    };
    if (state.pending) {
      const matches = await sql(
        `SELECT id FROM blocks WHERE box=${quote(state.notebook)} AND type='d' AND hpath=${quote(state.pending.path)} LIMIT 2`,
      );
      assert.ok(
        matches.length <= 1,
        "Pending document path is ambiguous; inspect it without retrying the write",
      );
      if (matches.length) await completeDocument(state.pending, matches[0].id, true);
      else {
        // A source create may still be in-flight after a lost response. Do not
        // automatically repeat it merely because the current index is empty.
        throw new Error(
          "A pending write has no indexed document yet. Wait for the kernel and inspect its outcome before clearing this checkpoint.",
        );
      }
    }
    const before = await snapshot();
    const target = options.pilot ? Number(before.blocks) + 60 : Number(options.target);
    assert.ok(
      Number.isSafeInteger(target) && target > 0 && target <= 1_000_000,
      "Pass a positive --target (at most 1,000,000) for this individual stage",
    );
    emit({ event: "stage-start", target, notebook: state.notebook, before });
    let blocks = Number(before.blocks);
    const started = performance.now();
    while (blocks < target) {
      abort.signal.throwIfAborted();
      const overhead = options.pilot ? 1 : state.corpusExists ? 3 : 5;
      const nativeBudget = Math.max(overhead + 1, Math.min(BATCH_BLOCKS, target - blocks));
      const document = makeFixtureDocument({
        stamp: state.stamp,
        batch: state.nextBatch,
        nativeBudget,
        corpusExists: state.corpusExists,
        priorAnchors: state.anchors,
        pilot: options.pilot,
      });
      const [existing] = await sql(
        `SELECT count(*) AS total FROM blocks WHERE id IN (${document.ownedIds.map(quote).join(",")}) LIMIT 1`,
      );
      assert.equal(
        Number(existing.total),
        0,
        "Planned IDs already exist; refusing to overwrite or silently remap source identities",
      );
      const paths = await sql(
        `SELECT id FROM blocks WHERE box=${quote(state.notebook)} AND type='d' AND hpath=${quote(document.path)} LIMIT 1`,
      );
      assert.equal(
        paths.length,
        0,
        "Planned document path already exists; refusing to modify existing content",
      );
      // Checkpoint precedes the native mutation. Failed/uncertain writes are
      // reconciled through source reads, never blindly retried.
      state.pending = document;
      saveState(statePath, state);
      const docId = await api("/api/filetree/createDocWithMd", {
        notebook: state.notebook,
        path: document.path,
        markdown: document.markdown,
      });
      await completeDocument(document, docId);
      const [current] = await sql(
        `SELECT count(*) AS blocks FROM blocks WHERE box=${quote(state.notebook)} LIMIT 1`,
      );
      assert.ok(Number(current.blocks) > blocks, "The source block count did not advance");
      blocks = Number(current.blocks);
    }
    const after = await snapshot();
    const result = {
      event: "stage-complete",
      target,
      notebook: state.notebook,
      elapsedMs: Math.round(performance.now() - started),
      before,
      after,
      timings,
    };
    state.lastStage = { ...result, completedAt: new Date().toISOString() };
    saveState(statePath, state);
    emit(result);
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
