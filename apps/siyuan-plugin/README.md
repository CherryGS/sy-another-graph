# SiYuan frontend plugin scaffold

`src/index.ts` re-exports the empty plugin class in `src/plugin.ts`. Vite builds
the entry as `dist/index.js`, with the `siyuan` API supplied by the host.
Files in `public/` are copied into `dist/` alongside the entry.

Run the repository commands from the workspace root:

```sh
pnpm check
pnpm dev
```

The scaffold includes TypeScript, React, Oxlint, and Vitest. Graph behavior and
Cosmograph integration will be developed after the design handoff.
