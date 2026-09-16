# Graph core

Original Rust implementation of directed graph snapshots for the SiYuan plugin.
The core uses forward and reverse compressed sparse row indices, canonical
directed edge pairs, reusable generation-stamped visitation storage, and weak
component IDs. SiYuan document/reference normalization belongs to the data
adapter; this crate does not parse `.sy` files.

`load` validates endpoint pairs before replacing the previous snapshot, removes
duplicate directed edges and self links, and calculates total degrees and weak
components. `neighborhood` returns a breadth-first projection with an exact node
budget and explicit truncation. `shortest_path` respects direction and returns an
empty buffer when disconnected. Numeric indices are valid only for one snapshot.

The browser owns one dedicated Worker per loaded snapshot. Loading another
snapshot terminates old computation and rejects pending requests. A Worker owns
the WASM instance; JavaScript receives owned output arrays. Transferable buffers
are the default. Cross-origin isolated hosts may use immutable SharedArrayBuffer
transport; this does **not** make the Rust computation multithreaded. Generated
WASM bindings copy data across the JavaScript/WASM memory boundary.

## Verification

Run from the repository root:

```sh
cargo test --workspace --all-targets
wasm-pack build crates/graph-core --target web --out-dir ../../apps/siyuan-plugin/wasm --out-name graph_core --release
cargo run --release -p graph-core --example benchmark
node apps/siyuan-plugin/src/engine/benchmark.mjs
pnpm --dir apps/siyuan-plugin exec vitest run src/engine/client.test.ts
```

On 2026-09-08, Windows x86-64, Rust 1.97.0, wasm-pack 0.15.0,
the deterministic fixture contains 100,000 nodes and 400,000 unique directed
edges. Each node connects to its modular offsets 1, 7, 97, and 997. One cold
measurement produced:

| Runtime                 |     Build | Full neighborhood | Directed path |
| ----------------------- | --------: | ----------------: | ------------: |
| Native release          |  7.768 ms |          1.971 ms |      0.685 ms |
| Release WASM in Node.js | 16.303 ms |          4.488 ms |      2.457 ms |

WASM initialization took 14.079 ms and the binary occupied 37,549 bytes. The
shortest path contained 106 nodes. These measurements cover graph computation
and the generated WASM bindings. They do not measure SiYuan extraction, Worker
startup, browser rendering, GPU simulation, or compare performance with the
native SiYuan graph. Browser capacity claims require those additional checks.
