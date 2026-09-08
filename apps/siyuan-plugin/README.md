# SiYuan graph workbench

The CommonJS entry re-exports the host adapter from `src/plugin.ts`. It registers
an Atlas tab and creates one retained `ui/index.html` browsing context from the
plugin's local assets. `src/host/` positions this application-owned iframe over
the active tab anchor; tab closure does not disconnect it.

The ESM workbench lives in `src/app/`; data acquisition and normalization are in
`src/data/`, the Rust Worker adapter is in `src/engine/`, and the Cosmograph
resource lifecycle is in `src/graph/`. The graph stays mounted across TanStack
routes; host and route visibility only pause/resume it. Plugin unload releases
the retained resources.

Run `pnpm check`, `pnpm build`, and `pnpm deploy:test <workspace>` from the
repository root. `pnpm dev` watches the host adapter; `pnpm dev:ui` watches the
workbench. Normal builds do not write into SiYuan workspaces.

The generated `wasm/` directory is produced by the root WASM build and is
untracked. All runtime WASM/worker assets are included in `dist/ui/assets/`.
