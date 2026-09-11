# Atlas · SiYuan Graph

Explore the indexed blocks, references, document hierarchy, and database
relationships in your current SiYuan workspace.

## Open a graph

Enable the plugin and click the Atlas toolbar icon, or press **Alt+Shift+G**.
To start from a particular document or block, use its Atlas graph action in the
document title-icon menu, document-tree menu, top-right More menu, or single-block
menu.

A document or block scope contains only its permitted content. Document scopes
include descendant documents by default; the scope control can exclude them.
Notebook filters, subtree exclusions, node types, and enabled relationship types
further determine the graph you explore. Without a document or block scope, the
graph includes all indexed workspace content allowed by those filters.

## Choose nodes and explore relationships

- Search by title or ID, or click a node to inspect it. Details include source
  paths and excerpts where available. Double-click an eligible node to open its
  native SiYuan source. Hover the inspector title or a relationship source/target
  to preview the native content; click the title or source entry to open it.
- **Shift-click** toggles a node's chosen membership. Chosen nodes have equal
  status, remain fixed during simulation, and keep persistent labels. Inspecting
  another node preserves the chosen set.
- Set **N** and the traversal direction in the toolbar. All chosen nodes serve
  as starting points for automatic neighborhood highlighting. Increasing N
  highlights more relationship steps within the current scope, while the rest
  of that scope remains visible as background.
- Neighborhoods and connecting paths respect the current scope and relationship
  filters. They cannot pass through outside nodes to reach another scoped node.
  Highlighting reports when its 10,000-node budget is reached; this budget does
  not remove the remaining background graph.
- Filtering a chosen node out of the graph removes its chosen membership and
  fixed position. The optional isolation filter keeps eligible chosen nodes.

Open the toolbar legend for node-type colors and counts. Node and relationship
inspectors overlay the canvas so the graph stays visible.

## Discover text mentions

Open **Graph filters** and set **Text mentions** to **Chosen nodes** or
**All in scope**. It is disabled by default. Both modes share one asynchronous
local index of document titles and native names/aliases. Chosen mode includes
incoming and outgoing mentions for every chosen node, including a chosen
document's own eligible body; inspecting another node leaves that set intact.

Gold dotted arrows connect ordinary prose to matching names. Open a relationship
to see its source passage, highlighted match, occurrence count, and any same-name
candidates. Code, links, and explicit-reference syntax are excluded. Existing
enabled references take precedence over duplicate text mentions. These are
possible connections to assess from their source passages.

Both endpoints must remain inside the active scope and exclusions. Enabled
mentions participate in layout, neighborhoods, and paths, with one hop per edge.
Index progress and limited coverage are reported. Mode and selection changes
reuse the cache; note, title, and alias edits update it through source refresh.

## Move and arrange the view

- Drag a node to move it. **Shift-drag from a chosen node** moves the chosen set
  together. Dragging across a label does not release the node.
- Switch between **2D** and **3D** in the graph toolbar. In 2D, drag blank space to
  pan. In 3D, drag blank space to orbit and **Space-drag** to pan. Scroll to zoom.
- Use **Fit** to frame the graph, and pause or resume the layout from the
  lower-right canvas controls. Display and force settings control appearance
  and motion. Center gravity attracts unpinned nodes toward the layout center
  while chosen nodes keep their fixed positions.

Tab and page changes retain the graph session. Source refreshes keep valid
choices and restore matching node positions and the current view.

## Insights, saved views, and export

Insights show graph structure, highly connected nodes, and runtime information.
Up to 50 saved views store filters, mention mode, the complete chosen set,
multi-selection state, and the independently inspected identity in the current
browser; layout coordinates remain session state.
Display and force preferences are also saved in the current browser.

JSON export captures the visible graph and creates a temporary export file in
the SiYuan workspace. Use the persistent **Download JSON** link to save it.
Exporting does not change note content.

## Data and availability

Atlas reads workspace content without editing notes, references, or database
fields. Saved views and preferences use browser-local storage. Graph resources
are bundled locally, and graph data stays on the current SiYuan origin.

Available content depends on SiYuan's index. If notes change during acquisition,
Atlas may report an incomplete or changed snapshot; use Refresh after editing
settles. Unavailable database data and processing limits are reported in the UI.

Version 0.1 targets desktop use with SiYuan 3.8.3 or later. Verification currently
covers the SiYuan 3.8.3 WebUI on Windows. Large-graph responsiveness depends on
the device and layout settings.

## Attribution

Visualization by [Cosmograph](https://cosmograph.app/), licensed under
[CC BY-NC 4.0 / separate commercial terms](https://cosmograph.app/docs-general/citing-and-licensing/).
Its attribution remains visible. React, TanStack Router, DuckDB-WASM, Apache
Arrow, and other dependencies retain their respective licenses.
The bundled Markdown parser notices are in
[third-party-mentions.txt](third-party-mentions.txt).
