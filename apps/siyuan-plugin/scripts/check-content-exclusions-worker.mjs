import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { Worker } from "node:worker_threads";

export async function verifyContentExclusionsWorker() {
  const assets = new URL("../dist/ui/assets/", import.meta.url);
  const bundles = readdirSync(assets).filter((name) =>
    /^content-exclusions\.worker-[\w-]+\.js$/.test(name),
  );
  assert.equal(bundles.length, 1, "The release must contain one content exclusion worker");
  const worker = new Worker(new URL("./mentions-worker-bootstrap.mjs", import.meta.url), {
    workerData: new URL(bundles[0], assets).href,
  });
  let timer;
  let pipeline = false;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Built content exclusion worker did not finish")),
        10_000,
      );
      worker.once("error", reject);
      worker.on("message", (message) => {
        if (message.kind === "boot") {
          const node = (id, index, label, parentId, blockType = "d", rootId = id) => ({
            id,
            index,
            label,
            parentId,
            blockType,
            rootId,
            notebook: "",
            path: "",
          });
          worker.postMessage({
            source: {
              nodes: [
                node("category", 0, "2026-09"),
                node("body", 1, "", "category", "p", "category"),
                node("kept", 2, "Child document", "category"),
                node("archive", 3, "Archive"),
                node("removed", 4, "Child document", "archive"),
              ],
              edges: [],
            },
            rules: [
              { kind: "regex", value: "^\\d{4}-\\d{2}$", scope: "document" },
              { kind: "text", value: "archive", scope: "subtree" },
            ],
          });
        } else if (message.kind === "error") reject(new Error(JSON.stringify(message.error)));
        else if (message.kind === "result") {
          try {
            if (pipeline) {
              assert.deepEqual(message.result.ids, ["y"]);
              assert.deepEqual(message.result.steps[2].retainedIds, ["x"]);
              assert.equal(message.result.steps[2].removedIds.length, 1);
              resolve();
              return;
            }
            assert.deepEqual(message.result, {
              ids: ["category", "body", "archive", "removed"],
              matchedRoots: 2,
              documents: 3,
              blocks: 1,
            });
            pipeline = true;
            worker.postMessage({
              source: {
                nodes: ["a", "b", "x", "y"].map((id, index) => ({
                  id,
                  index,
                  label: id,
                  blockType: "d",
                  rootId: id,
                  notebook: "",
                  path: "",
                  emptyDocument: index > 1,
                })),
                edges: [
                  [0, 2],
                  [2, 1],
                  [0, 3],
                  [3, 1],
                ].map(([source, target]) => ({ source, target, kind: "reference", weight: 1 })),
              },
              rules: [],
              context: {
                pipeline: {
                  order: ["subtree", "document", "empty"],
                  enabled: { subtree: true, document: true, empty: true },
                  preserveConnections: true,
                },
                projection: {
                  notebook: "",
                  scopeId: "",
                  includeChildDocuments: true,
                  excludeIds: [],
                  references: true,
                  hierarchy: false,
                  databases: true,
                  documentsOnly: true,
                  hiddenTypes: [],
                },
              },
            });
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
