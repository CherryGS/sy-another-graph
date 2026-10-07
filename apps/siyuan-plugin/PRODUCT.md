# Product: Another Graph

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

SiYuan desktop users exploring relationships in their local notes. Their primary
jobs are narrowing a graph to relevant documents or blocks, following connections,
and inspecting the actual evidence behind a relationship. The owner confirmed
this audience and operating context for the UI review on 2026-10-07.

## Product Purpose

Another Graph (另一个图谱) is a SiYuan graph plugin that increases usable graph
capacity and provides a polished workbench for exploration, filtering and
inspection. Success means users can understand relationships in their own notes
without losing graph context or changing note content.

## Positioning

The plugin combines Cosmograph rendering with SiYuan document/block identities,
scoped filtering and inspectable relationship evidence. Rust/WASM and local
Workers support graph computation and rendering preparation. Performance claims
must remain tied to measured workloads, hardware and settings.

## Operating Context

- The React workbench runs in a persistent iframe inside desktop SiYuan.
- Source data comes from the local workspace or complete native/HZ Simple Search
  results, with structural ancestor context for search graphs.
- Users select starting nodes, explore directional neighborhoods and paths,
  inspect nodes/edges, adjust filters and save named filter presets.
- Optional layered layouts, grouping and related-document discovery support
  exploration without replacing selection or source evidence.
- The configured demonstration workspace is `E:/Data/SYTest`, served on port 6806. Public screenshots use demonstration notes, never personal note content.
- The interface supports Simplified Chinese and English and follows SiYuan's
  language. Note content and user-authored names remain intact.

## Capabilities and Constraints

- Preserve existing graph, filter, preset, selection and inspection behavior
  during visual refinement. Compact operation and large-graph performance are
  confirmed priorities.
- Keep graph state and rendering resources at plugin/application scope across
  host document switches and tab close/reopen.
- Acquire notes read-only. Keep runtime resources local, escape graph labels,
  preserve vendor attribution and retain the iframe network policy.
- Preserve distinctions between chosen nodes, inspected nodes, neighborhoods,
  discovery highlights and original search matches.
- Keep inspectors overlaid on the graph rather than resizing the graph viewport.
- Report acquisition issues, truncation and unsupported runtime capabilities
  explicitly, with inspectable diagnostic context.
- Start ordinary new filter configurations with documents only, containment off
  and text mentions off; search graphs use an independent temporary preset.
- Insights and browser-local Saved Views are excluded. Additional discovery,
  folding and multi-view ideas are not automatically authorized features.
- Existing implementation uses React, TanStack Router, Tailwind CSS, Radix/shadcn
  primitives, Cosmograph, local DuckDB and a Rust graph-core crate.

## Brand Commitments

- Product name: `另一个图谱` in Chinese and `Another Graph` in English.
- Package/storage identity remains `sy-another-graph`.
- Preserve the existing product icon and Cosmograph attribution.
- Do not invent testimonials, customers, capacity guarantees or unsupported
  product claims.

## Evidence on Hand

- Product authority: `../../project-doc/INTENT.md` and the contracts under
  `../../project-doc/design/`. This record summarizes those sources for
  Impeccable; it does not supersede them.
- Feature/workflow guidance: `../../docs/user-guide.md` and its Chinese version;
  keyboard/mouse guidance: `../../docs/mouse-keyboard_zh_CN.md`.
- Current public demonstration captures: `public/preview.jpg`,
  `public/screenshots/layered.jpg` and `public/screenshots/discovery.jpg`.
- Runtime boundaries and build/deployment rules: `../../rules/implementation.md`.
- Historical UI review: `../../project-doc/report-ui.md`; its recommendations
  require checking against current source and rendered UI.

## Product Principles

1. Let graph exploration lead the workbench.
2. Keep relationship evidence and scope understandable.
3. Preserve local note content and durable user configurations.
4. Support compact, efficient operation without sacrificing clear feedback.
5. Ground capacity claims and design findings in observable evidence.
