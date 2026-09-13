# 一个思源图谱

Explore connections between SiYuan notes, blocks, and search results in a local
2D or 3D graph.

[简体中文使用说明](apps/siyuan-plugin/public/README_zh_CN.md) ·
[User guide](apps/siyuan-plugin/public/README.md)

## What it does

- **Start from your content.** Open the graph from a document, block, or the
  complete result set of a native or HZ Simple Search query.
- **Keep useful scopes.** Save named filter presets. Search results use a separate
  temporary preset, preserving the previous configuration and its unsaved edits.
- **Follow connections.** Inspect references, containment, database relations,
  and optional text mentions; explore directional neighborhoods and shortest paths.
- **Check the evidence.** Inspect original endpoints, source passages, and
  database fields, with native previews and links back to the source.
- **Shape the view.** Switch 2D/3D, tune forces and labels, or cluster communities.
  Optional 2D territories preserve the meaning of existing node colors.
- **Understand incomplete data.** Reading issues appear in a compact toast with
  an expandable, copyable diagnostic report. Export the visible graph as JSON.

The default view shows documents and references. Filter controls can expose
other block types and relations. Hidden native blocks can be represented by
their document without importing unrelated source facts.

## Open a graph

Enable **一个思源图谱**, then use its toolbar icon or **Alt+Shift+G**. Document
title, document tree, and block context menus also offer a graph entry.

In the native search tab or dialog, click **Build graph from all results**. The
button reads every page using the completed search query, including commands
translated by [HZ Simple Search](https://github.com/Hug-Zephyr/HZ-syplugin-simple-search).
It shows progress and supports cancellation. Open **Filter** to adjust the
temporary graph or return to the previous configuration.

Search scope contains the matched nodes, without automatically adding their
descendants. Semantic search, encrypted notebooks, and SQL that cannot be
completely paginated are currently unsupported. Limits and errors are explicit;
see the [search guide](apps/siyuan-plugin/public/README.md#turn-a-search-into-a-graph).

## Build and verify

Requires Node.js 24+, pnpm 11.21.0, Rust with the
`wasm32-unknown-unknown` target, wasm-pack, and its matching wasm-bindgen helper.
WASM builds use `no-install` mode; provision those tools before building.

Run from the repository root:

| Command | Result |
| --- | --- |
| `pnpm check` | Validate dependencies, deployment guards, Rust, WASM, TypeScript, tests, and built artifacts. |
| `pnpm build:artifacts` | Build the plugin into `apps/siyuan-plugin/dist/`. |
| `pnpm deploy:test E:/Data/SYTest` | Install built artifacts into the explicit test workspace. |
| `pnpm release` | Build, validate, and install into the configured personal workspace `E:/Data/Siyuan`. |
| `pnpm deploy:release` | Validate and install already built artifacts into the personal workspace. |
| `pnpm dev` / `pnpm dev:ui` | Watch the host adapter / React workbench in separate terminals. |

`pnpm build` is equivalent to `pnpm release` and deploys to the personal workspace.
Checks and artifact-only builds do not deploy. Deployment updates only managed
files, preserves unrelated files, and rejects linked targets or unmanaged
collisions. Reload the plugin after installation.

The package/storage ID remains `sy-another-graph`. No marketplace publication
is required for the configured local installation. Runtime requests use the
current SiYuan origin; the test workspace uses port 6806.

## Implementation

The host adapter uses SiYuan's CommonJS plugin API. One retained same-origin iframe
runs React, shadcn/ui, TanStack Router, Cosmograph, and the Rust WASM graph worker.
Tab switches and close/reopen preserve the graph session; plugin unload releases
its resources. Runtime rendering and database resources are bundled locally.

Acquisition reads indexed blocks, references, and database data without editing
notes or relation fields. Scope and exclusions precede type projection and
traversal; displayed relationships retain their source evidence. Temporary search
identities remain outside the saved-preset schema. Source changes refresh the
retained graph, with incomplete reads reported explicitly.

The WASM engine uses revision-scoped numeric topology while native IDs remain
persistent identities. Stale worker responses are rejected. Appearance settings
are browser-local; JSON export creates a temporary file in the workspace.

`apps/siyuan-plugin/` contains the host, workbench, acquisition, and workers.
`crates/graph-core/` contains Rust algorithms and tests.
See [implementation rules](rules/implementation.md) and
[plugin development notes](apps/siyuan-plugin/README.md).
`project-doc/` is an independent local-only documentation repository, excluded
from the delivery repository.

<details>
<summary>Benchmarks and the developer pressure fixture</summary>

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

</details>

## Attribution

Visualization by [Cosmograph](https://cosmograph.app/). Cosmograph 2.5.1 uses
[CC BY-NC 4.0 / separate commercial terms](https://cosmograph.app/docs-general/citing-and-licensing/);
its attribution remains visible. Other bundled dependencies retain their
respective licenses. See the [text-mention notices](apps/siyuan-plugin/public/third-party-mentions.txt)
and [community notices](apps/siyuan-plugin/public/third-party-communities.txt).
