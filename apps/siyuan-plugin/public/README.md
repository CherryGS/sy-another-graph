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

New sessions start with document nodes and references; containment and text
mentions are disabled. Hidden native block references remain represented by
their owning documents. Document-only mode also hides new non-document block
types that appear later.

## Switch filter presets

Click **Filter: preset name** to open the compact preset menu. **New preset** is
first; edit, copy, rename, and delete controls follow each preset. New presets use the
conservative document defaults. Copies keep the chosen preset's saved rules.
Use a preset's **Edit filters** action to adjust scope, notebooks, relationships,
and types. Editing another preset first applies that preset; reopening the active
preset keeps its temporary changes. Unsaved custom rules have their own editable
row, including after deleting the active preset.

Changes apply to the graph immediately and mark the preset with an asterisk.
Choose **Update preset** to replace its saved rules, or **Save as preset** to
create an independent configuration. Deleting a preset keeps the current graph
configuration; **Undo** restores the deleted entry.

Up to 50 presets are stored in the current workspace's plugin data. Reloading
restores the last active preset after validating its source scope, unless newer
filter or native-scope actions have already taken precedence. Unavailable sources
and storage failures are reported. Search text, chosen nodes, and layout positions
are not part of a filter preset. Switching filters keeps choices that remain
eligible in the new graph.

The SiYuan graph tab shows its current scope and preset name. An asterisk marks
modified rules, and the tab tooltip provides the filter summary. Inspecting a
node or changing the neighborhood depth does not rename the tab.

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
- Adjust **Label density** in the display settings to show more labels in
  available space. The denser middle option is the default; all three options
  retain overlap avoidance and are saved in the current browser.

Tab and page changes retain the graph session. Source refreshes keep valid
choices and restore matching node positions and the current view.

## Community layout

In **Graph settings → Force layout**, enable **Community aggregation** to draw
connected groups closer together. Existing node colors, selection, pinning,
and graph relationships retain their meaning. The feature is off by default.

- **Attraction strength** adjusts Cosmograph's native cluster force. Zero keeps
  the computed groups while disabling that force. A paused layout changes when
  you resume it.
- **Granularity** controls the grouping scale; larger values generally produce
  finer groups. It recalculates membership for the current graph in a separate
  local Worker. Changing attraction strength reuses membership.
- **Community territory background (2D)** optionally paints subtle regions
  near group members. Regions follow movement and zoom, leave distant empty
  space unpainted, and do not intercept graph interaction. The background is
  disabled in 3D; native community attraction works in both dimensions.

Leiden grouping uses the current eligible nodes and enabled relationships, with
one undirected, equal-weight connection per distinct node pair. Repeated
occurrences and reciprocal edges do not add grouping weight. Original edge
directions, counts, and source evidence remain available in the graph. Singleton
groups receive no additional attraction or territory. The status counts only
groups with at least two nodes.

Community work is cancelled when replaced and reports failure without preventing
ordinary graph use. Detection and territory timings depend on graph structure
and the device. Dependency notices are in [third-party-communities.txt](third-party-communities.txt).

## Toolbar and export

The workbench opens directly to the graph. Search, filter presets, the legend,
neighborhood controls, 2D/3D, Refresh, Export, and Settings share one wrapping
toolbar above the canvas. Display and force preferences are saved in the current
browser; layout coordinates and chosen nodes remain session state.

JSON export captures the visible graph and creates a temporary export file in
the SiYuan workspace. Use the persistent **Download JSON** link to save it.
Exporting does not change note content.

## Data and availability

Atlas reads workspace content without editing notes, references, or database
fields. Appearance preferences use browser-local storage. Graph resources
are bundled locally, and graph data stays on the current SiYuan origin.

Available content depends on SiYuan's index. If notes change during acquisition,
Atlas may report an incomplete or changed snapshot; use Refresh after editing
settles. Unavailable database data and processing limits are reported in the UI.
Reading issues appear as a temporary toast at the lower left of the graph.
**View details** opens a modal with affected identities, available source
locations, reasons, impact, and suggested checks. The compact lower-left issue
button reopens the report after the toast disappears. The report can be copied,
and available sources can be opened without changing graph selection or filters.
Totals cover all detected issues; each category retains up to 20 detail records,
with omitted records and shortened values explicitly marked. Diagnostic scope is
the acquired workspace index, before display filters. Imported database field
keys are preserved as opaque identifiers rather than validated as native block IDs.
Document-only defaults reduce the displayed graph; source acquisition and the
background text-mention index still process workspace data.

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
