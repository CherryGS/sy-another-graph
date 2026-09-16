# Benchmarks and the developer pressure fixture

The runtime reads only indexed SiYuan workspace data; there is no demo dataset
generator or source picker in the plugin. Synthetic workloads belong to
automated tests, standalone algorithm benchmarks, or the explicit developer
workspace fixture below. The Rust core's separate 100k/400k benchmark is
documented in [its README](../crates/graph-core/README.md).

## Developer workspace pressure fixture

[The fixture CLI](stress-fixture.mjs) creates synthetic notes through the
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

The default checkpoint is `temp/atlas-stress.local` at the repository root,
ignored by Git. Its parent directory is created when needed. Preserve it
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
