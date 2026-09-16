# Implementation rules

## Commands

Run these entry points from the repository root. Their arguments are kept in
tracked package scripts and tool configuration.

| Command                        | Purpose                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                   | Run the complete Rust, WASM, frontend, and artifact validation sequence.                                                                                                                                |
| `pnpm format`                  | Format source, tests, scripts, and configuration with Prettier and rustfmt.                                                                                                                             |
| `pnpm format:check`            | Verify formatting without writing files.                                                                                                                                                                |
| `pnpm check:deps`              | Verify frozen dependency installation and strict peer dependencies.                                                                                                                                     |
| `pnpm lint`                    | Run Oxlint in check-only mode.                                                                                                                                                                          |
| `pnpm typecheck`               | Check the TypeScript project references.                                                                                                                                                                |
| `pnpm test`                    | Run the TypeScript, acquisition, renderer-table, and worker tests.                                                                                                                                      |
| `pnpm test:deploy`             | Verify managed deployment and path guards using temporary workspaces.                                                                                                                                   |
| `pnpm test:package`            | Verify marketplace archive contents, metadata, path guards, and license notices.                                                                                                                        |
| `pnpm test:publish`            | Verify version selection and publication safeguards in temporary local Git repositories without contacting GitHub.                                                                                      |
| `pnpm publish:plugin`          | Select a version increment, validate and package, then confirm a version commit, atomic push, and GitHub Latest Release. Use `--bump patch --dry-run` for a preview without mutations or remote access. |
| `pnpm package`                 | Build and validate a marketplace `package.zip` inside the member's `dist/`, without deployment or upload.                                                                                               |
| `pnpm package:artifacts`       | Package existing validated build output; optional `--tag vX.Y.Z` checks the intended release tag.                                                                                                       |
| `pnpm test:rust`               | Run the native Rust graph tests.                                                                                                                                                                        |
| `pnpm lint:rust`               | Run Clippy with warnings denied.                                                                                                                                                                        |
| `pnpm build:wasm`              | Build generated browser WASM bindings with existing tools.                                                                                                                                              |
| `pnpm build:artifacts`         | Build WASM, the SiYuan host adapter, and the React workbench into `dist/`.                                                                                                                              |
| `pnpm build` / `pnpm release`  | Test deployment guards, build release artifacts, validate the plugin, and deploy to the configured personal workspace `E:/Data/Siyuan`.                                                                 |
| `pnpm check:plugin`            | Validate built metadata, required assets, and the CommonJS loader contract.                                                                                                                             |
| `pnpm deploy:release`          | Validate and copy existing release artifacts to `E:/Data/Siyuan`.                                                                                                                                       |
| `pnpm dev`                     | Watch the CommonJS host adapter without clearing UI output.                                                                                                                                             |
| `pnpm dev:ui`                  | Watch the ESM workbench and its assets.                                                                                                                                                                 |
| `pnpm deploy:test <workspace>` | Copy the built plugin into an explicitly selected test workspace.                                                                                                                                       |

## General rules

- Keep files that serve as module indexes or aggregation roots limited to module
  declarations, API re-exports, and dependency or composition wiring. Put product
  and domain behavior in the modules they expose.

## Domain rules

- The SiYuan frontend build emits a CommonJS `index.js` and keeps `siyuan`
  external so the host supplies its API, following the official plugin sample.
- Keep generated build output in the member's `dist/` directory. Root release
  builds deploy to the owner's explicitly configured personal workspace.
  Artifact-only builds, checks, tests, and watchers do not deploy there. Every
  deployment requires an explicit workspace path and may replace only this
  build's managed files.
- Keep note acquisition read-only; do not use native graph APIs that persist
  graph settings merely to read graph data.
- Keep runtime resources local and graph labels escaped. Preserve vendor
  attribution and the iframe network policy.
- Use revision-scoped numeric topology and persistent document IDs. Reject stale
  worker responses and dispose obsolete GPU/database/worker resources.
- Report view truncation, partial acquisition, and unsupported shared-memory
  capabilities explicitly. Synthetic benchmarks are separate from live-data
  acquisition and do not establish universal rendering guarantees.
