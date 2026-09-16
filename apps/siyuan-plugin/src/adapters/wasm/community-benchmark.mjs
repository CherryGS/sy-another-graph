import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initSync, detect_communities } from "../../../wasm/graph_core.js";

const wasm = initSync({
  module: await readFile(new URL("../../../wasm/graph_core_bg.wasm", import.meta.url)),
});
for (const kind of ["sparse", "hub"]) {
  const nodes = 100_000;
  const endpoints = new Uint32Array(nodes * 10);
  let cursor = 0;
  for (let i = 0; i < nodes; i++)
    for (const skip of [1, 7, 97, 997, 7919]) {
      endpoints[cursor++] = i;
      endpoints[cursor++] = kind === "hub" && skip === 7919 && i < 69_422 ? 0 : (i + skip) % nodes;
    }
  const start = performance.now();
  const membership = detect_communities(nodes, endpoints, 1);
  const calculationMs = performance.now() - start;
  assert.equal(membership.length, nodes);
  assert(membership.every((id) => id < nodes));
  const groups = new Set(membership).size;
  assert(groups > 1 && groups < nodes);
  console.log(
    JSON.stringify({
      kind,
      nodes,
      inputPairs: endpoints.length / 2,
      groups,
      calculationMs,
      wasmMemoryBytes: wasm.memory.buffer.byteLength,
    }),
  );
  const repeated = detect_communities(nodes, endpoints, 1);
  assert.deepEqual(repeated, membership, "A fixed graph and seed must reproduce membership");
}
