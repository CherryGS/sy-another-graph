# Atlas · SiYuan Graph

A SiYuan graph workbench using Cosmograph, React, TanStack Router, and a Rust
WASM graph engine. The plugin is named `sy-another-graph`.

## Features

- Document graphs from indexed SiYuan notebooks, with aggregated block references
  and document hierarchy derived from SiYuan paths.
- Search, notebook/relation filters, visible-graph isolation filtering, node
  details, and document navigation in a compact embedded toolbar layout.
- Draggable nodes, directional reference/hierarchy arrows, and stable colors
  by document branch, notebook, or degree. Focused neighborhoods highlight all
  participating nodes while retaining a distinct selected root.
- Full-graph neighborhoods and shortest paths computed in a dedicated WASM
  Worker. Neighborhood views report their 10,000-node budget when reached.
- Saved filter/selection views, source restoration, and graph insights.
- Local JSON export and explicitly labeled 10k/100k synthetic scale fixtures.
- A retained application session: document switching, insights/saved routes,
  and closing/reopening the graph tab preserve the graph, layout, and camera.
- Locally bundled renderer/database resources, escaped graph labels, and an
  iframe network policy that restricts connections to the current origin.

## Build and verify

Use Node.js 24+, pnpm 11.21.0, Rust with the `wasm32-unknown-unknown` target,
wasm-pack, and its matching wasm-bindgen helper. The tested tools were Node
24.18.0, Rust 1.97.0, and wasm-pack 0.15.0. The build uses wasm-pack's
`no-install` mode, so tool provisioning is separate from routine builds.

```sh
pnpm check
pnpm build
pnpm deploy:test E:/Data/SYTest
```

`pnpm check` runs frozen dependency validation, Clippy, Rust tests, WASM build,
Oxlint, TypeScript, Vitest, frontend/plugin builds, and artifact validation.
Build output is in `apps/siyuan-plugin/dist/`.

The test deployment command requires an explicit existing SiYuan workspace. It
copies only the built plugin into that workspace's plugins directory and records
managed files. It refuses an unrelated pre-existing plugin. Windows directory
junctions were not served reliably by the tested SiYuan version, so deployment
uses ordinary files.

Reload SiYuan, enable **Atlas Graph / Atlas 思源图谱** in downloaded plugins, and
use the graph toolbar icon or **Alt+Shift+G**. The supplied test environment is
`http://127.0.0.1:51436`.

For frontend development, run these watchers in separate terminals, then
redeploy and reload after changes:

```sh
pnpm dev
pnpm dev:ui
```

Rebuild WASM with `pnpm build:wasm` after changing Rust.

## Data and runtime behavior

The host adapter is CommonJS. One same-origin iframe contains the ESM workbench
and stays connected to the application document for the plugin's lifetime.
Custom tabs provide positioning anchors. Closing a tab hides the retained
workbench; plugin unload releases it. TanStack Router uses iframe-local hash
history, and the graph route stays mounted beneath auxiliary views. Visibility
changes pause/resume rendering without reloading notes or rebuilding tables.
The bridge accepts only its own iframe/parent and origin.

Graph indices are revision-local integers; persisted selections use SiYuan IDs.
The graph core uses directed CSR, deduplication, weak components, BFS
neighborhoods, and shortest paths. The UI's neighborhood/path operations use
the full graph and reset relation/notebook filters to show their results.
Traversal can follow arrows, reverse arrows, or use both directions. Reference
arrows point from the citing document to the cited document; hierarchy arrows
point from parent to child. Refresh explicitly reloads the workspace snapshot.

SharedArrayBuffer transport is enabled only in a supported cross-origin
isolated context. The supplied SiYuan WebUI does not provide that context, so
the verified path uses transferable buffers. Shared transport is not threaded
WASM, and the JS/WASM boundary still involves copies.

Source acquisition is read-only and bounded by the initial scan limits.
References are aggregated within 4,096-row SQLite rowid windows and merged
across windows, avoiding repeated full-table regrouping. Bounded batches are
returned as a single JSON result so host row caps cannot silently drop groups.
It detects many concurrent changes, but separate API calls cannot guarantee a
transactionally consistent snapshot while notes are edited. Refresh after such
a warning. Closed or unindexed notebook content is not promised by this
document-level database projection.

Saved views remain in the current browser, with a maximum of 50. Author and
repository metadata are unset because this is a local development build.

JSON export uses SiYuan's export endpoint to create a file in the workspace's
temporary export directory. Use the persistent **Download JSON** link to save
the generated snapshot. The UI confirms file generation separately from the
browser's download action; exporting does not alter notes.

## Observed scale evidence

In the supplied SiYuan 3.8.3 WebUI, the renderer's actual counts matched
**100,000 nodes and 233,331 links** for the synthetic fixture. High-index
selection and a bounded neighborhood also worked. One run measured 25.2 ms for
fixture generation and 11.1 ms for Worker/WASM graph construction. These are
single-run measurements, not GPU frame rates or universal capacity guarantees.

The test workspace's stored native global-graph output cap was 16,384. That is a
configuration limit, not a native rendering benchmark or intrinsic ceiling.
The Rust core's separate 100k/400k benchmark is documented in
[its README](crates/graph-core/README.md).

## Repository

- `apps/siyuan-plugin/`: host adapter, workbench, acquisition, and worker client.
- `crates/graph-core/`: Rust graph algorithms and native tests.
- `rules/implementation.md`: commands and repository rules.
- `project-doc/`: independent local Git repository for intent, design decisions,
  and verification evidence; ignored by the delivery repository.

## Third-party licensing

Cosmograph attribution remains visible. Cosmograph 2.5.1 is distributed under
CC BY-NC 4.0; commercial use has separate vendor licensing. See the
[official licensing information](https://cosmograph.app/docs-general/citing-and-licensing/).
React, TanStack Router, DuckDB-WASM, Apache Arrow, and other bundled dependencies
retain their respective licenses. This repository has not been published to a
marketplace.
