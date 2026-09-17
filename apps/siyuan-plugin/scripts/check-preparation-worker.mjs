import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { tableFromIPC } from "apache-arrow";

export async function verifyPreparationWorker() {
  const assets = new URL("../dist/ui/assets/", import.meta.url);
  const bundles = readdirSync(assets).filter((name) =>
    /^graph-preparation\.worker-[\w-]+\.js$/.test(name),
  );
  assert.equal(bundles.length, 1, "The release must contain one renderer preparation Worker");
  const worker = new Worker(new URL("./mentions-worker-bootstrap.mjs", import.meta.url), {
    workerData: new URL(bundles[0], assets).href,
  });
  const send = (request, withEdges) => {
    const columns = {
      points: {
        id: ["alpha", "beta"],
        label: ['<img src="https://invalid.example/pixel"> & Alpha', "Beta"],
        notebook: ["book", "book"],
        color: ["#123456", "#abcdef"],
        branchColor: ["#123456", "#abcdef"],
        degreeColor: ["#123456", "#abcdef"],
        typeColor: ["#123456", "#abcdef"],
        degree: new Float32Array([2, 1]),
        accentedIndices: new Uint32Array([1]),
      },
      links: {
        sourceIndex: new Uint32Array(withEdges ? [0, 1, 1] : []),
        targetIndex: new Uint32Array(withEdges ? [1, 0, 1] : []),
        colorIndex: new Uint8Array(withEdges ? [0, 2, 1] : []),
        weight: new Float32Array(withEdges ? [2, 1, 1] : []),
        width: new Float32Array(withEdges ? [1.75, 0.95, 0.95] : []),
        style: new Uint8Array(withEdges ? [0, 1, 2] : []),
      },
    };
    worker.postMessage({ request, columns }, [
      columns.points.degree.buffer,
      columns.points.accentedIndices.buffer,
      ...Object.values(columns.links).map((column) => column.buffer),
    ]);
    assert.equal(columns.points.degree.byteLength, 0, "Transfer only owned input buffers");
  };
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Built renderer preparation Worker did not finish")),
        10000,
      );
      worker.once("error", reject);
      worker.on("message", (message) => {
        try {
          if (message.kind === "boot") {
            send(1, true);
            return;
          }
          assert.equal(message.kind, "prepared", JSON.stringify(message));
          assert.equal(message.pointsCount, 2);
          const points = tableFromIPC(message.ipc.points),
            links = tableFromIPC(message.ipc.links);
          assert.equal(
            points.getChild("label").get(0),
            "&lt;img src=&quot;https://invalid.example/pixel&quot;&gt; &amp; Alpha",
          );
          assert.ok(points.getChild("labelWeight").get(1) > points.getChild("labelWeight").get(0));
          assert.equal(links.getChild("source").type.toString(), "Utf8");
          if (message.request === 1) {
            assert.equal(message.linksCount, 3);
            assert.deepEqual(Array.from(links.getChild("sourceIndex")), [0, 1, 1]);
            assert.deepEqual(Array.from(links.getChild("style")), [0, 1, 2]);
            assert.deepEqual(Array.from(links.getChild("color")), [
              "#91b7df",
              "#60728d",
              "#d6b670",
            ]);
            send(2, false);
          } else {
            assert.equal(message.request, 2);
            assert.equal(message.linksCount, 0);
            assert.equal(links.numRows, 0);
            resolve();
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
}
