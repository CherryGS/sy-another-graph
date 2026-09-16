import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { initSync, WasmGraph } from "../../wasm/graph_core.js";

const bytes = await readFile(new URL("../../wasm/graph_core_bg.wasm", import.meta.url));
const initStart = performance.now();
initSync({ module: bytes });
const initializationMs = performance.now() - initStart;
const nodes = 100_000;
const edges = new Uint32Array(nodes * 8);
let offset = 0;
for (let node = 0; node < nodes; node += 1) {
  for (const skip of [1, 7, 97, 997]) {
    edges[offset++] = node;
    edges[offset++] = (node + skip) % nodes;
  }
}
const graph = new WasmGraph();
try {
  const buildStart = performance.now();
  graph.load(nodes, edges);
  const buildMs = performance.now() - buildStart;
  const statistics = graph.statistics();
  assert.deepEqual([...statistics], [nodes, 400_000, 1, nodes]);
  assert(graph.degrees().every((value) => value === 8));
  assert(graph.component_ids().every((value) => value === 0));
  const queryStart = performance.now();
  const neighborhood = graph.neighborhood(new Uint32Array([0]), 0, 0xffff_fffe, nodes);
  const fullNeighborhoodMs = performance.now() - queryStart;
  assert.equal(neighborhood[0], 0);
  assert.equal(neighborhood.length, nodes + 1);
  assert.equal(new Set(neighborhood.subarray(1)).size, nodes);
  const bounded = graph.neighborhood(new Uint32Array([0]), 0, 10, 100);
  assert.equal(bounded[0], 1);
  assert.equal(bounded.length, 101);
  const pathStart = performance.now();
  const path = graph.shortest_path(0, nodes - 1, 2);
  const pathMs = performance.now() - pathStart;
  assert.equal(path[0], 0);
  assert.equal(path.at(-1), nodes - 1);
  assert.throws(() => graph.load(1, new Uint32Array([0, 1])));
  assert.equal(graph.statistics()[0], nodes);
  console.log(
    JSON.stringify(
      {
        backend: "Rust WASM in Node.js",
        nodes,
        edges: statistics[1],
        initializationMs,
        buildMs,
        fullNeighborhoodMs,
        pathMs,
        pathNodes: path.length,
        wasmBytes: bytes.byteLength,
      },
      null,
      2,
    ),
  );
} finally {
  graph.free();
}
