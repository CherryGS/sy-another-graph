# Implementation rules

## Commands

Run these entry points from the repository root. Their arguments are kept in
tracked package scripts and tool configuration.

| Command | Purpose |
| --- | --- |
| `pnpm check` | Run the complete Rust, WASM, frontend, and artifact validation sequence. |
| `pnpm check:deps` | Verify frozen dependency installation and strict peer dependencies. |
| `pnpm lint` | Run Oxlint in check-only mode. |
| `pnpm typecheck` | Check the TypeScript project references. |
| `pnpm test` | Run the TypeScript, acquisition, renderer-table, and worker tests. |
| `pnpm test:rust` | Run the native Rust graph tests. |
| `pnpm lint:rust` | Run Clippy with warnings denied. |
| `pnpm build:wasm` | Build generated browser WASM bindings with existing tools. |
| `pnpm build` | Build WASM, the SiYuan host adapter, and the React workbench. |
| `pnpm check:plugin` | Validate built metadata, required assets, and the CommonJS loader contract. |
| `pnpm dev` | Watch the CommonJS host adapter without clearing UI output. |
| `pnpm dev:ui` | Watch the ESM workbench and its assets. |
| `pnpm deploy:test <workspace>` | Copy the built plugin into an explicitly selected test workspace. |

## General rules

- Keep files that serve as module indexes or aggregation roots limited to module
  declarations, API re-exports, and dependency or composition wiring. Put product
  and domain behavior in the modules they expose.

## Domain rules

- The SiYuan frontend build emits a CommonJS `index.js` and keeps `siyuan`
  external so the host supplies its API, following the official plugin sample.
- Keep routine build output in the member's `dist/` directory. Test deployment
  requires an explicit workspace and may replace only this build's managed files.
- Keep note acquisition read-only; do not use native graph APIs that persist
  graph settings merely to read graph data.
- Keep runtime resources local and graph labels escaped. Preserve vendor
  attribution and the iframe network policy.
- Use revision-scoped numeric topology and persistent document IDs. Reject stale
  worker responses and dispose obsolete GPU/database/worker resources.
- Report view truncation, partial acquisition, and unsupported shared-memory
  capabilities explicitly. Synthetic benchmarks are separate from live-data
  acquisition and do not establish universal rendering guarantees.

## User preferences

- Use `uv run python` for Python usage.
- Prefer CodeGraph for structural and cross-file exploration when a repository
  has an existing `.codegraph/` index, following the top-level guidance.
- Use a 10-minute timeout when waiting for subagents.
