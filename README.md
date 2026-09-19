# 一个思源图谱

Explore SiYuan notes, blocks, and search results in an interactive 2D / 3D graph.

[简体中文](apps/siyuan-plugin/public/README_zh_CN.md) ·
[User guide](docs/user-guide.md) ·
[Development](apps/siyuan-plugin/README.md)

![Graph overview with a selected node, highlighted neighbors, and relationship details](apps/siyuan-plugin/public/preview.jpg)

_Demonstration notes from the test workspace: select a node, follow its connections, and inspect their sources._

## What you can do

| Feature                      | Use it to…                                                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Explore the graph**        | Switch between 2D / 3D and force / hop-layer layouts. Shift-click multiple starting nodes and follow directional neighborhoods or shortest paths.                            |
| **Find related documents**   | Discover notes that cite the same material or are cited together. Compare ranked candidates, inspect supporting references, and explicitly add candidates to your selection. |
| **Choose your scope**        | Filter by notebook, document or block, node type, and excluded subtrees. Save frequently used configurations as named presets.                                               |
| **Turn search into a graph** | Include every page of native search or [HZ Simple Search](https://github.com/Hug-Zephyr/HZ-syplugin-simple-search), with ancestor context and visible match rings.           |
| **Inspect connections**      | Explore references, containment, database relations, and optional text mentions. Preview original notes and trace relationship evidence.                                     |
| **Adjust and export**        | Color nodes by type, branch, notebook, or degree; tune labels and community clustering, show 2D community territories, and export the visible graph as JSON.                 |

## Get started

1. In desktop SiYuan **3.8.3+**, enable the plugin and click its toolbar icon or press **Alt+Shift+G**.
2. Start with the default document-reference graph, or use **View in graph** from a document or block context menu.
3. Open **Filter** to narrow the scope. Select starting nodes, then try **Layered** or **Discover relationships**.

The interface follows SiYuan's language, with Simplified Chinese and English support.
Graph acquisition reads the local index without editing notes. Large-graph responsiveness depends on the data, hardware, and layout settings.

See the [user guide](docs/user-guide.md) for search behavior, mention exclusions, source diagnostics, runtime requirements, and limits.

## Development

[Setup and commands](apps/siyuan-plugin/README.md) ·
[Feature costs](docs/feature-complexity.md) ·
[Filtering and projection](docs/filtering-pipeline.md) ·
[Pressure fixture](scripts/stress-fixture.md) ·
[Rust core](crates/graph-core/README.md)

## License and attribution

Original project code is [MIT licensed](LICENSE). Visualization is provided by
[Cosmograph](https://cosmograph.app/) under
[CC BY-NC 4.0 / separate commercial terms](https://cosmograph.app/docs-general/citing-and-licensing/),
with its attribution preserved. See [NOTICE.md](NOTICE.md) for bundled terms and modifications.
