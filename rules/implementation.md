# Implementation rules

## Commands

Run these entry points from the repository root. Their arguments are kept in
tracked package scripts and tool configuration.

| Command | Purpose |
| --- | --- |
| `pnpm check` | Run the complete bootstrap validation sequence. |
| `pnpm check:deps` | Verify frozen dependency installation and strict peer dependencies. |
| `pnpm lint` | Run Oxlint in check-only mode. |
| `pnpm typecheck` | Check the TypeScript project references. |
| `pnpm test` | Run Vitest with compact output; the empty scaffold has no product tests. |
| `pnpm build` | Build the SiYuan frontend plugin. |
| `pnpm check:plugin` | Validate built metadata, required assets, and the CommonJS loader contract. |
| `pnpm dev` | Watch sources and rebuild the plugin into its local `dist/` directory. |

## General rules

- Keep files that serve as module indexes or aggregation roots limited to module
  declarations, API re-exports, and dependency or composition wiring. Put product
  and domain behavior in the modules they expose.

## Domain rules

- The SiYuan frontend build emits a CommonJS `index.js` and keeps `siyuan`
  external so the host supplies its API, following the official plugin sample.
- Keep routine build output in the member's `dist/` directory. This scaffold does
  not configure writes or links into a live SiYuan data workspace.
- Treat member paths and plugin metadata as provisional bootstrap choices.
  Establish graph contracts, supported environments, and capacity criteria in
  design rather than inferring them from the scaffold.

## User preferences

- Use `uv run python` for Python usage.
- Prefer CodeGraph for structural and cross-file exploration when a repository
  has an existing `.codegraph/` index, following the top-level guidance.
- Use a 10-minute timeout when waiting for subagents.
