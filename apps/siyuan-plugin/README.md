# Plugin development

[Project overview](../../README.md) · [User guide](public/README.md)

## Setup and commands

Requires Node.js 24+, pnpm 11.21.0, Rust with the `wasm32-unknown-unknown` target,
wasm-pack, and the wasm-bindgen helper matching `Cargo.lock`. WASM builds use
`no-install` mode, so provision those tools before building.

Run commands from the repository root:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Install locked dependencies and apply the tracked dependency patches. |
| `pnpm check` | Validate dependencies, deployment guards, Rust, WASM, TypeScript, tests, and built artifacts. |
| `pnpm build:artifacts` | Build the plugin into `apps/siyuan-plugin/dist/`. |
| `pnpm deploy:test <workspace>` | Install built artifacts into an explicitly selected workspace. |
| `pnpm build` / `pnpm release` | Build, validate, and install into the configured personal workspace `E:/Data/Siyuan`. |
| `pnpm deploy:release` | Validate and install existing artifacts into the personal workspace. |
| `pnpm dev` / `pnpm dev:ui` | Watch the host adapter / React workbench in separate terminals. |

Checks, artifact-only builds, and watchers do not deploy. Deployment replaces
managed plugin files while preserving unrelated files, and rejects linked
targets or unmanaged collisions. Reload the plugin after installation.
The configured test workspace is `E:/Data/SYTest`, served on port 6806.

## Source layout

| Path | Responsibility |
| --- | --- |
| `src/plugin.ts`, `src/host/` | CommonJS SiYuan adapter and retained graph iframe. |
| `src/app/` | React workbench with shadcn/ui and TanStack Router. |
| `src/data/` | Read-only acquisition, normalization, scope, and projection. |
| `src/graph/` | Cosmograph rendering, interaction, and resource lifecycle. |
| `src/engine/` | Rust WASM worker adapter. |
| `../../crates/graph-core/` | Graph algorithms and Rust tests. |
| `../../patches/` | Versioned Cosmograph/Cosmos changes applied by pnpm. |

The host retains one iframe across tab switches and close/reopen. Plugin unload
releases its resources. Runtime assets are bundled locally; requests stay on the
current SiYuan origin. Generated `wasm/` and `dist/` output is untracked.

Scope and exclusions apply before type projection and traversal. Displayed
relationships retain source evidence; temporary search identities stay outside
saved presets. The worker uses revision-scoped numeric topology with persistent
native IDs and rejects stale responses. Appearance settings are browser-local;
JSON export creates a temporary workspace file.

## Further reading

- [Implementation rules](../../rules/implementation.md)
- [Workspace pressure fixture](../../scripts/stress-fixture.md)
- [Rust benchmarks](../../crates/graph-core/README.md)

The package/storage ID is `sy-another-graph`. `project-doc/` is a separate,
local-only documentation repository excluded from the delivery repository.
