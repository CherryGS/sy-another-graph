import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { Worker } from "node:worker_threads";

export async function verifyLayoutGroupsWorker() {
  const assets = new URL("../dist/ui/assets/", import.meta.url);
  const bundles = readdirSync(assets).filter((name) =>
    /^layout-groups\.worker-[\w-]+\.js$/.test(name),
  );
  assert.equal(bundles.length, 1, "The release must contain one layout set matching worker");
  const worker = new Worker(new URL("./mentions-worker-bootstrap.mjs", import.meta.url), {
    workerData: new URL(bundles[0], assets).href,
  });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Built layout set worker did not finish")), 10_000);
      worker.once("error", reject);
      worker.on("message", (message) => {
        if (message.kind === "boot") {
          worker.postMessage({
            nodes: [
              { id: "a", title: "Project Alpha" },
              { id: "b", title: "Project Beta" },
              { id: "c", title: "Other" },
              { id: "d", title: "Unmatched" },
              { id: "e", title: "Nested block" },
            ],
            source: {
              nodes: [
                { id: "c", index: 2, blockType: "d", label: "", notebook: "", path: "" },
                {
                  id: "hidden",
                  index: 5,
                  blockType: "d",
                  parentId: "c",
                  label: "",
                  notebook: "",
                  path: "",
                },
                {
                  id: "e",
                  index: 4,
                  blockType: "p",
                  parentId: "hidden",
                  rootId: "hidden",
                  label: "",
                  notebook: "",
                  path: "",
                },
              ],
              edges: [],
            },
            sets: [
              {
                id: "first",
                name: "First",
                enabled: true,
                rules: [{ kind: "regex", value: "^project alpha$" }],
              },
              {
                id: "second",
                name: "Second",
                enabled: true,
                rules: [
                  { kind: "text", value: "project" },
                  { kind: "id", value: "c" },
                ],
              },
            ],
          });
        } else if (message.kind === "error") reject(new Error(JSON.stringify(message.error)));
        else if (message.kind === "result") {
          try {
            assert.deepEqual([...message.result.membership], [0, 1, 1, 0xffffffff, 1]);
            assert.deepEqual([...message.result.matches], [1, 4]);
            assert.deepEqual([...message.result.sizes], [1, 3]);
            assert.deepEqual(message.result.keys, ["first", "second"]);
            assert.equal(message.result.count, 1);
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
