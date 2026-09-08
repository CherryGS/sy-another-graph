# SiYuan graph workbench

The CommonJS entry re-exports the host adapter from `src/plugin.ts`. It registers
an Atlas tab and mounts `ui/index.html` from the plugin's local assets.

The ESM workbench lives in `src/app/`; data acquisition and normalization are in
`src/data/`, the Rust Worker adapter is in `src/engine/`, and the Cosmograph
resource lifecycle is in `src/graph/`.

Run `pnpm check`, `pnpm build`, and `pnpm deploy:test <workspace>` from the
repository root. `pnpm dev` watches the host adapter; `pnpm dev:ui` watches the
workbench. Normal builds do not write into SiYuan workspaces.

The generated `wasm/` directory is produced by the root WASM build and is
untracked. All runtime WASM/worker assets are included in `dist/ui/assets/`.
