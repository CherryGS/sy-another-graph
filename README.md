# 一个思源图谱

Explore SiYuan notes, blocks, and search results in a local 2D or 3D graph.

[简体中文](apps/siyuan-plugin/public/README_zh_CN.md) ·
[User guide](apps/siyuan-plugin/public/README.md) ·
[Development](apps/siyuan-plugin/README.md)

## Features

- **Connected context:** references, containment, database relations, and optional
  text mentions, with source evidence and native previews.
- **Focused exploration:** document and block scopes, saved filter presets,
  directional neighborhoods, and shortest paths.
- **Search graphs:** all results from native search or
  [HZ Simple Search](https://github.com/Hug-Zephyr/HZ-syplugin-simple-search),
  with ancestor context and visible match rings.
- **Flexible views:** 2D/3D force and hop-layer layouts, community clustering, optional 2D territories,
  appearance controls, and JSON export.

## Quick start

Requires desktop SiYuan **3.8.3+**. Enable the plugin, then click its toolbar icon
or press **Alt+Shift+G**. Document and block context menus also provide a graph entry.

The graph requires WebAssembly exception handling (EH). If the runtime check fails,
update SiYuan or the browser; older engines without EH are unsupported.

The default view shows documents and references. Open **Filter** to adjust the
scope, block types, and relations. In the search page or dialog, click
**Graph all results** to create a temporary graph while preserving
your original preset. See the [user guide](apps/siyuan-plugin/public/README.md)
for search behavior and limits.

The interface follows SiYuan's language: Simplified Chinese or English, with
English as the fallback. Note content and saved preset names retain their original text.

The plugin reads local indexed data without editing notes. Read issues appear
in a toast with expandable diagnostics. Large-graph performance depends on
hardware, graph structure, and layout settings.

## Development

See [setup, commands, and architecture](apps/siyuan-plugin/README.md),
[feature complexity](docs/feature-complexity.md),
[filtering and projection](docs/filtering-pipeline.md),
[the workspace pressure fixture](scripts/stress-fixture.md), and
[Rust benchmarks](crates/graph-core/README.md).

## Attribution

Project code is [MIT licensed](LICENSE). See [third-party terms and modifications](NOTICE.md).

Visualization by [Cosmograph](https://cosmograph.app/), under
[CC BY-NC 4.0 / separate commercial terms](https://cosmograph.app/docs-general/citing-and-licensing/).
Its attribution remains visible. Other dependencies retain their licenses;
see [text-mention notices](apps/siyuan-plugin/public/third-party-mentions.txt)
and [community notices](apps/siyuan-plugin/public/third-party-communities.txt).
