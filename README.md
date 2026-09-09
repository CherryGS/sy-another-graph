# Atlas · SiYuan Graph

A SiYuan graph workbench using Cosmograph, React, shadcn/ui, TanStack Router, and a Rust
WASM graph engine. The plugin is named `sy-another-graph`.

## Features

- All indexed native block types, original block-reference endpoints, and native
  containment. Graph-wide type controls project hidden block endpoints to their
  owning documents while retaining source provenance.
- Logical SiYuan databases, real bound and detached items, and explicit relation
  fields, with distinct carrier, membership, binding, and item-relation edges.
- Title/ID search, notebook and relation controls, contained document/block
  scopes, subtree exclusions, and optional hiding of unchosen isolated nodes.
- Equal chosen membership with persistent labels and fixed positions. Shift-click
  toggles membership; ordinary dragging moves one node and Shift-drag from a
  chosen node moves the chosen set together.
- Automatic directional N-hop highlighting from the chosen set within the initial
  scope, retaining that scope as background. A dedicated WASM
  Worker reports when the 10,000-node neighborhood budget truncates a result.
- Node type, readable document path, heading ancestry, and source excerpts in
  hover/search/details. Edge inspection retains original source records and
  opens eligible native blocks or database contexts.
- Native document-title, document-tree, top-right More, and single-block menus
  open a scoped graph. Source-change notifications refresh the retained workbench
  while keeping valid choices, matching node positions, and the current camera across
  data updates.
- 2D and 3D views, node-type colors by default, and a separate display/force
  settings panel with browser-local preferences. Branch/notebook/degree coloring
  remains available. In 3D, drag blank space to orbit and Space-drag to pan;
  Shift-drag retains chosen-set movement.
- Type colors and node counts are available from the toolbar's collapsible
  legend, keeping the graph canvas clear.
- Saved filter/inspection views, existing path and insight tools, and local
  export of the visible graph.
- Locally bundled renderer/database resources, escaped graph labels, and an
  iframe network policy that restricts connections to the current origin.

## Build and verify

Use Node.js 24+, pnpm 11.21.0, Rust with the `wasm32-unknown-unknown` target,
wasm-pack, and its matching wasm-bindgen helper. The tested tools were Node
24.18.0, Rust 1.97.0, and wasm-pack 0.15.0. The build uses wasm-pack's
`no-install` mode, so tool provisioning is separate from routine builds.

Rust release builds use optimization level 3, Thin LTO, one codegen unit,
aborting panics, and stripped output. Vite applies its production JavaScript
and CSS minifiers and tree shaking. The measured release-profile comparison
retained these settings: fat LTO produced identical WASM, while Binaryen O3 and
SIMD compilation gave small, mixed runtime changes without improving the
neighborhood workload. Routine builds therefore do not require Binaryen or
additional WebAssembly target features.

Run the following from the repository root for personal release installation:

```sh
pnpm release
```

`pnpm build` is equivalent: it tests deployment guards, builds release artifacts,
validates the plugin, and automatically installs it into
`E:/Data/Siyuan/data/plugins/sy-another-graph`. This workspace is configured in
the root `deploy:release` script. No marketplace registration or upload is needed.
Use `pnpm deploy:release` to validate and install already built artifacts.

Validation and artifact-only commands remain available:

```sh
pnpm check
pnpm build:artifacts
pnpm deploy:test E:/Data/SYTest
```

`pnpm check` runs frozen dependency validation, deployment tests, Clippy, Rust
tests, WASM build, Oxlint, TypeScript, Vitest, frontend/plugin builds, and artifact
validation without deploying. `pnpm build:artifacts` only builds into
`apps/siyuan-plugin/dist/`. Test deployment requires the explicit workspace shown
above or another deliberately selected path.

Deployment records its managed files, updates those files, and removes obsolete
managed assets while preserving unrelated files. It refuses unmanaged collisions
and linked destinations. Windows directory junctions were not served reliably by
the tested SiYuan version, so installed plugins use ordinary files.

Reload SiYuan, enable **Atlas Graph / Atlas 思源图谱** in downloaded plugins, and
use the graph toolbar icon or **Alt+Shift+G**. The supplied test environment is
`http://127.0.0.1:6806`. Runtime requests use the current SiYuan origin rather
than a hardcoded port.

Scoped graph entry is available from the document's title-icon menu, its
top-right More menu, a single document's tree menu, and a single block's menu.
Each entry uses that document or block as the initial contained scope.

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

Graph indices are revision-local integers. Native blocks retain their SiYuan
IDs; database and item graph identities use `av:<avID>` and
`av-item:<avID>:<itemID>`. The current graph Q applies the initial document/block
scope, notebook/content exclusions, type projection, and enabled relation kinds
before traversal. Hidden block types
do not hide their visible children. Hidden native endpoints use their owning
documents without importing outside source facts; virtual containment connects
the nearest visible ancestor within the source boundary and keeps
the intervening source IDs.

Only the explicit chosen set S supplies neighborhood origins. The contained
scope B remains visible as background, while N controls hop highlighting within
that scope. Out-of-scope nodes cannot appear or act as intermediate traversal
steps, including paths that would leave the scope and re-enter it.
N and traversal direction are directly editable in the wrapping graph toolbar
and take effect automatically. Search and filter popovers anchor below the
entire toolbar, including when its controls wrap onto additional rows.
Changing N changes the reached highlight without treating all of B as origins.
All chosen members have equal status; inspecting a different node during
multi-selection does not change S. Hidden or excluded choices lose membership
and their fixed position. Optional isolation hiding retains eligible S members.
The document-scope control includes descendant documents by default and can
exclude them from both display and traversal. With no initial scope root, Q
contains all otherwise eligible content. Node and edge inspectors overlay the canvas.

Traversal follows arrows, reverses them, or uses both directions. Every enabled
relation costs one hop; disabled relations do not participate. Reference arrows
point from citing block to cited block before projection, and containment points
from ancestor to descendant. Database edges preserve their own meanings instead
of becoming citations or shortcuts between notes. Neighborhoods and the existing
path tool use Q without resetting notebook or relation settings.

Supported native source events advance a host-side dirty version. Notifications
are coalesced while the workbench is active; hidden changes wait until it becomes
active, and visibility alone does not trigger a reload. Changes arriving during
acquisition remain pending for another read. Manual refresh is also available.
Source updates keep filters and valid identities. Renderer table updates restore
coordinates for matching IDs and the captured 2D or 3D viewport; new nodes receive new
initial positions. Only S is pinned against subsequent simulation. Ordinary tab
and route transitions keep the existing graph and camera without rebuilding.

The default link spring is Cosmograph's `0.4`; an earlier settings release
accidentally persisted `1`. Preference migration corrects that legacy default
while retaining other settings and later explicit custom values. Simulation
cooling is measured in steps, not milliseconds, so elapsed settling time depends
on the rate at which the renderer advances the simulation.

Each renderer requests an 8,192-unit simulation space and retains that extent
through later data and appearance updates. This is independent of the canvas's
pixel size. Initial and newly generated positions use the effective extent
supported by the device; Fit diagnostics report both requested and effective
sizes. The existing center-gravity control attracts unpinned nodes toward the
world center without moving chosen pins or resetting the camera.

Lookup caches and stable view arrays avoid repeated whole-graph scans and
renderer uploads for unchanged views. Filters, the legend, and Insights share
cached summaries of immutable graph arrays; the top-eight hub summary avoids
sorting the full node array. Panel scrolling briefly yields simulation work
while preserving explicit user pause.

Version-pinned pnpm patches for Cosmos and Cosmograph 2.5.1 transfer continuous
label coordinates through a shared pixel pack buffer and GPU completion fence.
Regular and temporary endpoint labels use a 50–250 ms adaptive cooldown after
each completed read and flush final coordinates when simulation stops. Pinned
chosen labels retain their coordinates, and camera changes immediately reproject
cached positions. Hidden or empty label layers
do not request coordinates. Replaced data, dimensions, pin changes, cancellation,
and disposal invalidate pending snapshots. Explicit geometry operations such as
Fit retain their synchronous API. These changes reduce main-thread blocking;
they do not guarantee a frame rate. Patches and installed-vendor regression tests
are checked in under `patches/` and `src/graph/vendor-*.test.ts` in the plugin sources.

SharedArrayBuffer transport is enabled only in a supported cross-origin
isolated context. The supplied SiYuan WebUI does not provide that context, so
the verified path uses transferable buffers. Shared transport is not threaded
WASM, and the JS/WASM boundary still involves copies.

Source acquisition is read-only and bounded by initial scan high watermarks.
Blocks use indexed keyset pagination and retain their encoded source path as
well as SiYuan's readable `hpath` for display.
References are aggregated within 4,096-row SQLite rowid windows and merged
across windows, avoiding repeated full-table regrouping. Bounded batches are
returned as a single JSON result so host row caps cannot silently drop groups.
It detects many concurrent changes, but separate API calls cannot guarantee a
transactionally consistent snapshot while notes are edited. Refresh after such
a warning. Closed or unindexed notebook content is not promised by the indexed
source scan.

Database acquisition reads complete logical `getAttributeView` objects from
native carriers and follows explicit relation targets; filtered display views
do not define membership. It keeps actual item IDs separate from bound block
IDs, includes detached items without inventing documents, and does not infer
connections from ordinary field values or rollups. Limits of 4,096 logical
databases, 500,000 items, and 1,000,000 field associations are reported when
reached, as are unavailable databases or endpoints. Reads across logical
databases have no shared snapshot revision. Unused databases are not independently
enumerated.

Saved views remain in the current browser, with a maximum of 50. They store
filters and one inspected identity; they are not named coordinate arrangements
or complete chosen-set snapshots. Author and repository metadata are unset
because this is a local development build.

JSON export uses SiYuan's export endpoint to create a file in the workspace's
temporary export directory. Use the persistent **Download JSON** link to save
the generated snapshot. The UI confirms file generation separately from the
browser's download action; exporting does not alter notes.

## Benchmarks

The runtime reads only indexed SiYuan workspace data; there is no demo dataset
generator or source picker in the plugin. Synthetic workloads belong to
automated tests, standalone algorithm benchmarks, or the explicit developer
workspace fixture below. The Rust core's separate 100k/400k benchmark is
documented in [its README](crates/graph-core/README.md).

### Developer workspace pressure fixture

[The fixture CLI](scripts/stress-fixture.mjs) creates synthetic notes through the
native kernel so acquisition, indexing, traversal, and rendering can be examined
together. It is a developer tool under `scripts/`, not part of the plugin runtime.
Use an explicitly selected test workspace. Preview the plan, initialize a new
dedicated notebook, and validate a small pilot before increasing the target:

```sh
node scripts/stress-fixture.mjs --plan
node scripts/stress-fixture.mjs --init --write --workspace E:/Data/SYTest
node scripts/stress-fixture.mjs --write --pilot
node scripts/stress-fixture.mjs --write --target 1000
node scripts/stress-fixture.mjs --report
```

Run subsequent targets individually: `5000`, `10000`, `25000`, `50000`, then
`100000`. After each stage finishes, allow the graph to load the settled source
state, record counts and measurements, and decide whether to proceed. The CLI
does not automatically run every stage or decide where the performance
bottleneck lies. Run one fixture writer at a time and avoid source mutations
during a measurement.

The kernel origin defaults to `http://127.0.0.1:6806`; `--url` can select another
local origin. Before operating, the CLI verifies that `getWorkspaceInfo` matches
the selected workspace and the verified SiYuan version, currently 3.8.3. It does
not read authentication tokens. Native writes create a dedicated `Atlas Stress`
notebook and append new documents, with transaction flushes for verification.
SQL access is SELECT-only; the generator does not edit source SQLite files,
write `.sy` files directly, delete notes, or replace existing document content.
Planned block-ID and document-path collisions stop the run.

The default checkpoint is `atlas-stress.local`, ignored by Git. Preserve it
between stages: it contains the notebook identity, deterministic ID namespace,
completed batches, anchors, and any pending write. Use the same `--state <path>`
on every invocation when selecting a different checkpoint. Initialization refuses
an existing checkpoint. An already-created dedicated fixture notebook can be
adopted during initialization with its explicit `--notebook` and original
`--stamp` values. Ordinary stage runs also require that notebook to remain open
and retain its recorded name.

A checkpoint is written before each document creation. On resume, an uncertain
write is reconciled by reading the native document and verifying its block IDs
and indexed references. If the outcome is missing or inconsistent, the CLI stops
for inspection instead of blindly repeating the write. Running without `--write`
reports the current fixture state; `--plan` is an offline payload estimate.

The generated corpus includes repeated titles, headings, paragraphs, nested
lists/items, blockquotes, super-blocks, code, math, and tables. References cover
self, same-document, and cross-document relationships, at approximately four
indexed references per added native block. Cross-document targets already exist:
the verified kernel does not automatically backfill an earlier source's reference
index when its missing target is created later. Small database bound/detached/
relation fixtures can be prepared separately through native database APIs and
kept constant while this bulk corpus grows.

Keep these counting boundaries separate:

- `--target` and `--report` count native blocks in the dedicated fixture notebook,
  including documents and container/carrier blocks. The pilot and any separately
  added fixture content contribute to that count; the actual reported total is
  authoritative.
- Reported `refs` count native reference-index rows whose source blocks belong
  to that notebook. They exclude containment and database-field relationships
  and are not a count of every textual reference occurrence.
- Graph node/link counts depend on the loaded workspace, current filters and
  projection, database/item mediators, and enabled relation kinds. They need not
  equal either the fixture block count or its reference count.
- The 10,000-node neighborhood budget limits a derived expansion. Its truncation
  notice is distinct from source acquisition or full-graph rendering capacity.
  Offline Markdown-size estimates do not predict kernel storage or runtime memory.

Validate the generator's deterministic plans without touching a workspace:

```sh
node --test scripts/stress-fixture.test.mjs
```

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
