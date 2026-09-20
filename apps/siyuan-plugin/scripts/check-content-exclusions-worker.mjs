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
            assert.deepEqual(message.result, {
              ids: ["category", "body", "archive", "removed"],
              matchedRoots: 2,
              documents: 3,
              blocks: 1,
            });
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
}
