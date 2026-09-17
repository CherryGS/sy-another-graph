# Plugin development

[Project overview](../../README.md) · [User guide](public/README.md)

## Setup and commands

Requires Node.js 24+, pnpm 11.21.0, Rust with the `wasm32-unknown-unknown` target,
wasm-pack, and the wasm-bindgen helper matching `Cargo.lock`. WASM builds use
`no-install` mode, so provision those tools before building.

Run commands from the repository root:

| Command                             | Result                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`    | Install locked dependencies and apply the tracked dependency patches.                                     |
| `pnpm check`                        | Validate dependencies, deployment guards, Rust, WASM, TypeScript, tests, and built artifacts.             |
| `pnpm build:artifacts`              | Build the plugin into `apps/siyuan-plugin/dist/`.                                                         |
| `pnpm package`                      | Build, validate, and create `apps/siyuan-plugin/dist/package.zip` for the marketplace.                    |
| `pnpm deploy:test <workspace>`      | Install built artifacts into an explicitly selected workspace.                                            |
| `pnpm build` / `pnpm release`       | Build, validate, and install into the configured personal workspace `E:/Data/Siyuan`.                     |
| `pnpm publish:plugin`               | Select a patch/minor/major version, validate and package it, then confirm its GitHub Release publication. |
| `pnpm test:publish`                 | Verify release preparation, cancellation, and failure handling in temporary local Git repositories.       |
| `pnpm deploy:release`               | Validate and install existing artifacts into the personal workspace.                                      |
| `pnpm dev` / `pnpm dev:ui`          | Watch the host adapter / React workbench in separate terminals.                                           |
| `pnpm format` / `pnpm format:check` | Format or check TypeScript, styles, documentation and Rust.                                               |
| `pnpm check:boundaries`             | Check layer imports and Worker environment isolation.                                                     |

Checks, artifact-only builds, and watchers do not deploy. Deployment replaces
managed plugin files while preserving unrelated files, and rejects linked
targets or unmanaged collisions. Reload the plugin after installation.
The configured test workspace is `E:/Data/SYTest`, served on port 6806.

## Source layout

| Path                       | Responsibility                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `src/bootstrap/`           | Host and iframe entrypoints; concrete service composition.                             |
| `src/core/`                | Graph facts and evidence, scope/projection rules, structured diagnostics.              |
| `src/application/`         | Workspace source publication, session operation contracts, cross-capability workflows. |
| `src/modules/`             | Mentions, communities, presets, search and export capabilities.                        |
| `src/adapters/`            | SiYuan acquisition/storage/host bridge, Cosmograph rendering, Rust WASM transport.     |
| `src/workbench/`           | React bindings, graph presentation, panels and styles.                                 |
| `src/shared/`              | shadcn primitives, localization and small utilities.                                   |
| `../../crates/graph-core/` | Graph algorithms and Rust tests.                                                       |
| `../../patches/`           | Versioned Cosmograph/Cosmos changes and the Arrow CLI entry fix applied by pnpm.       |

The host retains one iframe across tab switches and close/reopen. Plugin unload
releases its resources. Runtime assets are bundled locally; requests stay on the
current SiYuan origin. Generated `wasm/` and `dist/` output is untracked.

The local DuckDB runtime bundles only its EH WASM and browser worker. Feature
detection rejects engines without WebAssembly exception handling before creating
the worker; no MVP or remote fallback is shipped. Artifact checks enforce this.

Renderer preparation keeps original node/edge lookups on the main thread and
encodes Arrow/IPC in a separate reusable Worker. Only rendering columns cross
that boundary; numeric buffers and returned IPC are transferred. Interrupted
jobs terminate the encoder, and stale results cannot replace a newer graph.
DuckDB uploads copy retained IPC bytes because its API detaches input buffers.

Scope and exclusions apply before type projection and traversal. Displayed
relationships retain source evidence; temporary search identities stay outside
saved presets. The worker uses revision-scoped numeric topology with persistent
native IDs and rejects stale responses. Appearance settings are browser-local;
JSON export creates a temporary workspace file.

The workspace source store publishes complete snapshots and retains the last
successful snapshot if refreshing fails. Sessions subscribe without owning the
reader. Numeric topology belongs to its effective graph; style and community
rendering indices are adapted separately. A language change never becomes an
input to source acquisition, projection or analysis caches.

Localization uses bundled i18next catalogs in `src/shared/i18n/`. The host passes
normalized language through the iframe URL and a checked same-origin handshake.
Core and Worker failures carry codes and parameters; presentation formats them
in the current language. Add complete sentences and matching parameters to both
catalogs. `pnpm test` checks catalog parity and referenced message coverage.

## Further reading

- [Feature complexity and cache costs](../../docs/feature-complexity.md)
- [Filtering, projection, and display scope](../../docs/filtering-pipeline.md)
- [Implementation rules](../../rules/implementation.md)
- [Marketplace release process](../../scripts/marketplace-release.md)
- [Workspace pressure fixture](../../scripts/stress-fixture.md)
- [Rust benchmarks](../../crates/graph-core/README.md)

The package/storage ID is `sy-another-graph`. `project-doc/` is a separate,
local-only documentation repository excluded from the delivery repository.
