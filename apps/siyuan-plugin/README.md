# SiYuan graph workbench

The CommonJS entry re-exports the host adapter from `src/plugin.ts`. It registers
a graph tab and creates one retained `ui/index.html` browsing context from the
plugin's local assets. `src/host/` positions this application-owned iframe over
the active tab anchor; tab closure does not disconnect it.

The ESM workbench lives in `src/app/`; data acquisition and normalization are in
`src/data/`, the Rust Worker adapter is in `src/engine/`, and the Cosmograph
resource lifecycle is in `src/graph/`. The graph stays mounted across TanStack
routes; host and route visibility only pause/resume it. Plugin unload releases
the retained resources.

Run commands from the repository root. `pnpm build` or `pnpm release` builds,
validates, and installs the plugin in the configured personal workspace at
`E:/Data/Siyuan`. This is a local installation without marketplace registration.

Use `pnpm check` for validation, or `pnpm build:artifacts` for an artifact-only
build; neither deploys. `pnpm deploy:test <workspace>` copies built artifacts
into an explicitly selected test workspace. `pnpm dev` watches the host adapter
and `pnpm dev:ui` watches the workbench without automatic deployment.

The generated `wasm/` directory is produced by the root WASM build and is
untracked. All runtime WASM/worker assets are included in `dist/ui/assets/`.
