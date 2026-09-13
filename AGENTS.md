## Routed rules

- Before changing production code, tests, manifests, dependencies, generated
  layout, or source ownership, read `rules/implementation.md`.

## Git conventions

- Emoji-prefixed conventional commits: `<emoji> <type>(<scope>): <subject>`.
  - ✨ feat · 🩹 fix · ♻️ refactor · 🔧 chore · 🎨 style · ⚡ perf · ✅ test · 🏗️ build · 🚦 ci · ⏪ revert · 📝 docs
- Commit when a task goal is achieved; then verify `git status --short` is clean.
- Treat `project-doc/` as an independent local-only Git repository: commit its
  changes there, keep it free of remotes, and never stage it from the containing
  repository.

## Project authority

- Intent: `project-doc/INTENT.md`.
- Logical design contracts: `project-doc/design/`.
- Implementation discussion and settled decisions: `project-doc/implementation/`.
