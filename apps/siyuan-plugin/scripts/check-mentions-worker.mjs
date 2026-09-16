import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { Worker } from "node:worker_threads";

export async function verifyMentionWorker() {
  const assets = new URL("../dist/ui/assets/", import.meta.url);
  const bundles = readdirSync(assets).filter((name) => /^mentions\.worker-[\w-]+\.js$/.test(name));
  assert.equal(bundles.length, 1, "The release must contain exactly one mention worker");
  const worker = new Worker(new URL("./mentions-worker-bootstrap.mjs", import.meta.url), {
    workerData: new URL(bundles[0], assets).href,
  });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Built mention worker did not complete a query")),
        10_000,
      );
      worker.once("error", reject);
      worker.on("message", (message) => {
        if (message.kind === "boot") {
          const blocks = [
            { id: "a", rootId: "a", type: "d", title: "Source", ial: "", markdown: null },
            { id: "b", rootId: "b", type: "d", title: "A&B", ial: "", markdown: null },
            {
              id: "p",
              rootId: "a",
              type: "p",
              title: "",
              ial: "",
              markdown: '**A&amp;B** 01 `A&B` ((20260822181032-6spbotb "A&B"))',
            },
            { id: "noise", rootId: "noise", type: "d", title: "01", ial: "", markdown: null },
          ];
          worker.postMessage({ kind: "load", revision: 1, blocks, excludedPatterns: ["^\\d{2}$"] });
          worker.postMessage({
            kind: "scope",
            revision: 1,
            scopeRevision: 1,
            scope: {
              entries: blocks.map((block, index) => ({ id: block.id, displayId: block.id, index })),
              explicitPairs: [],
            },
          });
          worker.postMessage({
            kind: "query",
            revision: 1,
            scopeRevision: 1,
            request: 1,
            mode: "all",
            chosenIds: [],
          });
        } else if (message.kind === "error") reject(new Error(message.message));
        else if (message.kind === "result") {
          try {
            assert.equal(message.result.edges.length, 1);
            assert.equal(message.result.edges[0].weight, 1);
            assert.equal(message.result.edges[0].provenance[0].mention.matched, "A&B");
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      });
    });
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
  await verifyPreviewWorker(assets);
}

async function verifyPreviewWorker(assets) {
  const bundle = readdirSync(assets).filter((name) =>
    /^exclusion-preview\.worker-[\w-]+\.js$/.test(name),
  );
  assert.equal(bundle.length, 1, "The release must contain one name-only exclusion preview worker");
  const worker = new Worker(new URL("./mentions-worker-bootstrap.mjs", import.meta.url), {
    workerData: new URL(bundle[0], assets).href,
  });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Built exclusion preview worker did not finish")),
        10_000,
      );
      worker.once("error", reject);
      worker.on("message", (message) => {
        if (message.kind === "boot") {
          worker.postMessage({
            kind: "load",
            revision: 1,
            blocks: [
              { id: "a", title: "０１", ial: '{: alias="Other"}' },
              { id: "b", title: "01", ial: "" },
              { id: "c", title: "101", ial: "" },
            ],
          });
          worker.postMessage({
            kind: "preview",
            revision: 1,
            request: 1,
            rules: { phrases: [], patterns: ["^\\d{2}$"] },
          });
        } else if (message.kind === "error") reject(new Error(JSON.stringify(message.error)));
        else if (message.kind === "result") {
          try {
            assert.equal(message.page.matchedNames, 1);
            assert.equal(message.page.matchedNodes, 2);
            if (message.pageRequest === 0) {
              assert.deepEqual(
                message.page.rows.map((row) => row.id),
                ["a", "b"],
              );
              worker.postMessage({
                kind: "page",
                revision: 1,
                request: 1,
                pageRequest: 1,
                offset: 0,
                query: "b",
              });
            } else {
              assert.deepEqual(
                message.page.rows.map((row) => row.id),
                ["b"],
              );
              resolve();
            }
          } catch (error) {
            reject(error);
          }
        }
      });
    });
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
}
