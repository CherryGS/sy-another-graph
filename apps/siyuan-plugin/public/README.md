# 一个思源图谱

Explore the connections in your SiYuan workspace, starting from a document, a
block, or a complete set of search results.

[简体中文](README_zh_CN.md)

## Start exploring

Enable **一个思源图谱** and click its toolbar icon, or press **Alt+Shift+G**.
Use **View in graph** in a document title, document tree, or block context menu
to start with that content as the scope.

The graph reads all indexed native block types. The default view shows documents
and references; open **Filter** to show blocks, containment, database relations,
or text mentions. Hidden native blocks can be represented by their owning
document without importing unrelated source relationships.

## Turn a search into a graph

1. Run a search in SiYuan's search tab or search dialog.
2. Click **Build graph from all results** beside the search result count.
3. The graph opens with a **Temporary** search preset containing every matched
   block across all pages, not only the currently displayed page.

The integration also works with [HZ Simple Search](https://github.com/Hug-Zephyr/HZ-syplugin-simple-search):
it uses the final query and filters after HZ translates its commands. Keyword,
query-syntax, regular-expression, and compatible read-only SQL searches are
supported. Grouping by document does not add context documents to the matches.

A search includes all matched blocks and their native ancestor chains, through
parent documents up to each notebook's top-level documents. The menu distinguishes
original matches from added ancestor nodes. All types and containment relations
start enabled, so the surrounding structure is connected immediately.
Filters can further narrow this scope; neighborhood and path operations stay
inside it. Resetting a temporary search restores these search-specific defaults.

Search hits use diamond points and a **◆ 命中** (match) label prefix; added
ancestors use circles. Colors retain their existing meaning in both 2D and 3D.
The legend counts visible direct matches, projected matches, and ancestors.
Hover, graph search results, and node details also identify each node's origin.
If a hidden matched block is represented by its document, that document is marked
**命中投影** (projected match), with the hidden match count in its details.
Search markings do not select or pin nodes, and existing selection rings remain
independent.

Open **Filter** to edit the temporary preset or **Return to original configuration**.
Your previous preset and its unsaved filter changes are retained. The temporary
entry can be reopened during the session; a new search replaces it. Search
snapshots are not saved to disk, rerun on refresh, or restored after plugin reload.
Refreshing graph data recomputes ancestry around the same original matched IDs.
Changes to the search page take effect in the graph only after building again.

Reading progress appears on the search button; click it again to cancel. A new
query or a newer build cancels the old request. Incomplete pages, changed totals,
invalid identities, or failed requests produce an error instead of opening a
partial result set. Searches are bounded to 500,000 matches, 10,000 pages, and
two minutes. Narrow the query if a limit is reached.

Semantic search and encrypted-notebook search are not currently supported.
Complex SQL whose complete result set cannot be paginated reliably is rejected.
Acquisition and search use separate reads: if a matched block is unavailable in
the graph index, the temporary preset reports the missing count and example IDs.
The integration targets SiYuan 3.8.3 and HZ Simple Search 1.3.6; native search UI
changes may require an adapter update.

## Explore relationships

- **Selection and neighborhoods:** click to inspect, Shift-click to add/remove
  chosen nodes, and adjust hop count and direction to explore connections.
  Available background context stays visible.
- **Source evidence:** inspect an edge to see its original endpoints and
  relationship evidence. Open source blocks or use the native preview.
- **Filter presets:** save named configurations, switch between them, and
  explicitly update or save edited filters. Presets hold filter rules rather
  than graph coordinates or node selections.
- **Text mentions:** optionally find possible connections from document titles,
  names, and aliases in ordinary prose. These are derived evidence, separate
  from explicit references, and do not edit notes.
- **Database connections:** explore databases, real items, bound blocks, and
  stored relation fields. Shared values alone do not create edges.
- **Community layout:** adjust clustering to bring related groups closer.
  Node colors retain their meaning; optional territory backgrounds are available
  in 2D. Membership changes layout, not scope or relationship semantics.
- **2D / 3D and appearance:** tune the layout, labels, node size, and links.
  Appearance preferences are stored in the current browser.
- **Export:** generate JSON for the visible graph, then use **Download JSON**.
  Export creates a temporary file in the workspace without changing notes.

## Data and diagnostics

The plugin reads SiYuan's local index without editing notes, references, or
database fields. Graph resources are bundled locally and graph data stays on
the current SiYuan origin. Tab switches and closing/reopening the graph retain
the running graph session.

Acquisition issues appear in a lower-left toast. **View details**, or the compact
issue button left after dismissal, opens a report with affected identities,
available source locations, reasons, impact, and suggested checks. Reports can
be copied. Each category retains up to 20 detail records and marks omissions.
Use **Refresh** after source changes or a failed read.

Desktop SiYuan 3.8.3 or later is required. Verification uses the 3.8.3 WebUI on
Windows. Large-graph responsiveness depends on hardware, graph structure, and
layout settings; document-only display still acquires the workspace index.

## Attribution

Visualization by [Cosmograph](https://cosmograph.app/), licensed under
[CC BY-NC 4.0 / separate commercial terms](https://cosmograph.app/docs-general/citing-and-licensing/).
Its attribution remains visible. Dependencies retain their respective licenses.
See [text-mention notices](third-party-mentions.txt) and
[community notices](third-party-communities.txt).
