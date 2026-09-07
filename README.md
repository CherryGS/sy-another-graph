# sy-another-graph

A SiYuan Notes graph plugin intended to use Cosmograph to increase usable graph
capacity. This repository currently contains the development scaffold.

## Workspace

- `apps/siyuan-plugin/`: the frontend plugin shell, generated with the official
  Vite React TypeScript initializer and normalized for SiYuan's CommonJS loader.
- `rules/implementation.md`: repository commands and implementation guidance.
- `project-doc/`: confirmed intent and subsequent design records, managed in an
  independent local Git repository and ignored by this repository.

Member names and paths are provisional physical organization. Logical graph
contracts and module boundaries belong to the design phase.

## Development

Use an already provisioned Node.js 24+ environment and pnpm 11.21.0. The package
manager is pinned to the version verified during bootstrap.

```sh
pnpm check
pnpm dev
```

`pnpm check` validates the frozen dependency installation, lint, TypeScript,
test-runner setup, production build, plugin metadata, and CommonJS entry.
`pnpm dev` watches the plugin sources and rebuilds into
`apps/siyuan-plugin/dist/`.

Vitest currently permits an empty test suite because this scaffold has no product
behavior. The artifact check evaluates the generated entry with a minimal host
API stub; it is not a live SiYuan integration test.

## Design handoff

The confirmed priority is increased usable graph capacity. Cosmograph integration,
representative workloads, comparison baselines, and measurable capacity criteria
remain design work. Other improvements follow the initial performance work.

The provisional plugin identifier is `sy-another-graph`. Author and repository
metadata remain unset; platform targets and the minimum SiYuan version need
integration validation before distribution.
