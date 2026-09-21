# Another Graph · User guide

Explore connections between SiYuan notes, blocks, and search results in 2D or 3D.

[Overview](../README.md) · [简体中文](user-guide_zh_CN.md)

## Start exploring

Requires desktop SiYuan **3.8.3+**. Enable the plugin, then click its toolbar icon
or press **Alt+Shift+G**. Use **View in graph** from a document title, document tree,
or block context menu to start from specific content.

The graph requires WebAssembly exception handling (EH). If the runtime check fails,
update SiYuan or the browser; older engines without EH are unsupported.

The default view shows documents and references. Open **Filter** to adjust the
scope, block types, and relations, or save a named preset.

The compact preset menu provides quick switching. Editing opens a narrow panel at the left of the canvas, below the toolbar. Icons and sideways labels select **Scope, Document exclusions, Relationships, Text mentions, Grouping, and Node display**. Clicking the active category collapses the content to a slim rail; reopening it restores the draft. The graph remains interactive. Notebook and document/block scope controls stay together; node types and isolated-node visibility share Node display. The two document exclusion fields stack with a divider. Open **Rule help** for the full syntax. Both exclusion editors use full-width **Apply exclusions** buttons. Switching categories retains inputs; dots and **Draft** badges identify unapplied changes. Apply the rules, then use the fixed footer to update or save a preset.

See the [mouse and keyboard reference (简体中文)](mouse-keyboard_zh_CN.md) for canvas gestures, search, sidebar navigation, and keyboard controls.

The interface follows SiYuan's language. Chinese variants use Simplified Chinese;
other languages use English. Note titles, aliases, excluded phrases and existing
preset names keep their original text.

## Group nodes with sets

In **Filter → Grouping**, choose **Off**, **Communities**, or **Sets**. Communities
derive groups from connections; Sets let you specify the members. Both use the
group-attraction control and optional 2D regions. Nodes keep their original
colors and connections. Attraction works in 2D/3D force layout; layered mode
offers a button to switch to force layout.

Create a set, give it a name, and enter one node ID, title substring, or `/regex/`
per line. Rules are combined with OR. Native IDs include the target and all its
descendant blocks and documents. Database and item IDs still match exactly.
Title text and regex ignore case and match each node independently, without
including descendants. ID expansion uses source containment even when an ancestor
is hidden, but only groups nodes in the current displayed graph; filtered nodes
are not restored. Use `^` and `$` to match a complete title with regex.

Click **Apply set** after editing rules or the name. Drag a card's handle to change
priority, or focus the handle and press Up/Down. Higher enabled sets take priority;
a node belongs to the first one it matches. Matched and Assigned counts explain
overlap. Disabling a set lets lower-priority sets receive its matching nodes;
re-enabling uses its existing position. Dragging commits after dropping.

**Update preset** saves the grouping mode, parameters, sets and their order.
Each preset owns an independent configuration, including when copied. Rules are
saved and reevaluated as the graph changes; switching grouping modes retains the
configured sets. Rule drafts are retained while switching modes/categories but
are not saved until applied. Existing community settings migrate into old
presets on load and are persisted on the next preset save.

Up to 50 sets, 2,000 rules and 128 regex patterns are supported per preset.
Matching runs in a cancellable worker with a 10-second deadline. Simplify or
disable a problematic set and retry if it times out.

## Exclude documents

The filter panel has three fixed steps that can be enabled and reordered:

- **Document content only** removes matched documents and their own blocks while retaining child documents and their relationships. Use it to hide date-based category documents.
- **Entire subtrees** removes matched documents/blocks and every descendant, including child documents. Use it for archive folders.
- **Empty documents** hides documents without body content, retaining child documents. Titles and child documents do not count as body content. Blank paragraphs are empty; media, attachments, code, formulas, databases and unknown content are kept.

Drag a handle, or focus it and press Up/Down. Steps execute top to bottom; a drag commits on drop. Empty-document exclusion starts disabled and last, preserving old preset behavior. **Keep empty documents needed for connections** defaults on: compute a stable undirected 0/1 minimum spanning forest using enabled native relationships, then repeatedly prune empty leaves. Keep all original edges among surviving nodes, and preserve native anchors needed by logical database entities. This does not minimize the number of retained empty documents. Later exclusions can still break connectivity; mentions are generated after node exclusions and do not participate in this calculation.

Enter one document/block ID, title substring, or `/regex/` per line. Text and JavaScript regex rules match full document titles after width, case, and whitespace normalization; they do not search bodies or aliases. Regex uses fixed case-insensitive Unicode flags. For example, `/^\d{4}-\d{2}$/` in the first group hides a `2026-09` category while keeping its child documents. `Archive` in the second group removes matching documents and their descendants. Subtree rules still apply where both groups overlap. Block IDs remove that block and its nested blocks in either group. Escape literal leading `/` or `\` with another `\`.

Each step reports newly removed nodes in the current scope and type projection, before isolated-node hiding. Overlaps count once. **View details** separates all matches, earlier removals, new removals and retained connectors, with search, pagination, Copy ID, native opening and location for nodes still in the graph. A shared draft preview runs after typing pauses; **Apply exclusions** applies text rules. Toggles and completed reordering apply immediately. Update the preset to save all configuration. No replacement reference edges are created and no notes are deleted. Excluded category nodes no longer mediate containment or paths.

Both groups allow up to 2,000 rules combined, including 128 regex rules, with at most 256 characters per rule. Invalid patterns show a line number. Matching runs in a cancellable background task with a 10-second deadline; edit or clear rules to recover. Update or save a preset to persist applied rules. Temporary search filters remain independent. Existing ID exclusions retain their behavior in the subtree group.

Mention exclusions retain separate name/node statistics. **Applied exclusions: relation impact** compares the applied rules with no exclusions in the current scope, mode and selection. It lists both removed and added directed relations, since removing one name can expose another match. The baseline runs only while the dialog is open, with explicit notices when indexing or output limits make the comparison incomplete.

## Turn a search into a graph

Run a native search or [HZ Simple Search](https://github.com/Hug-Zephyr/HZ-syplugin-simple-search),
then click **Graph all results** in the search tab or dialog.

- All result pages are included, together with ancestor chains up to top-level
  documents. All block types and containment start enabled.
- **Magenta rings** identify matches while preserving node colors and labels.
  A document representing hidden matched blocks is identified as a projected
  match in the legend and node details.
- The graph uses a **Temporary** preset. **Return to previous configuration**
  restores your previous preset and unsaved edits. Temporary searches last for
  the session; building another search replaces the previous one.

Rebuild after changing the search query. Graph refresh updates data for the same
matched IDs. The search button shows reading progress; click again to cancel.

## Explore relationships

- **Navigate:** inspect nodes and edges, Shift-click to select multiple nodes,
  and explore directional neighborhoods or shortest paths.
- **Copy an ID:** right-click a node circle or label and choose **Copy ID**.
  Works in 2D and 3D without changing the current selection.
- **Trace sources:** preview or open original blocks and inspect relationship evidence.
- **Discover related documents:** select starting nodes, then open **Discover
  relationships** in the toolbar to find shared-reference candidates.
- **Add relations:** enable containment, database connections, or text mentions
  derived from document titles, names, and aliases.
- **Adjust the view:** switch 2D/3D, tune forces and labels, cluster communities,
  or show optional community territories in 2D.
- **Export:** download the visible graph as JSON.

Select **Layered** in the toolbar to arrange nodes from left to right by minimum
hop distance from the nearest selected node. All selected nodes are equal seeds.
Layers follow the current scope, projection, enabled relations and traversal
direction; each enabled edge costs one hop. Neighborhood depth only affects
highlighting. Unreachable nodes occupy a compact separate area on the right, and node
details show distances. Each layer is a column in 2D or a plane in 3D.
Without selected seeds, existing positions are retained with a prompt to select.
Changing seeds, direction, scope or dimension rearranges nodes. You can drag
nodes between rearrangements; **Rearrange layers and fit** restores their layout.
Layered mode disables force motion. Returning to **Force** restores your force
parameters and pause setting without changing colors, relations or selection.

**Discover relationships** supports two rules:

- **Shared references:** A and B both cite X; X supports the result.
- **Co-cited:** X cites both A and B; X supports the result.

Discovery groups explicit references by documents available in the current graph.
Selected blocks use their available document; unsupported selections are skipped.
Scope, exclusions and search boundaries still apply, including when a document
represents hidden blocks. Enable references in the filter to use discovery.
Text mentions, containment and database connections do not count toward the score.

Candidates are ranked by weighted reference-set overlap: common reference
objects carry less weight, and repeated citations do not add points. Each starting
document is compared independently; the best overlap determines a candidate's
score, with evidence retained for every matching start. The score is not a
probability of semantic similarity.

Click a candidate to highlight its supporting references and inspect both sides
of each connection. Only **Add to selection** changes the selected nodes.
Clearing the evidence or closing the panel restores normal graph highlighting.
Up to 100 candidates are listed with the total count; details show up to 50
supporting documents per start and highlight at most 2,000 actual edges, with a
notice when evidence is limited. Queries support up to 128 starting documents
and stop explicitly if the work budget or 60-second timeout is exceeded.

For text mentions, enter one complete phrase or `/regex/` per line under
**Exclusion rules**, then click **Apply exclusions**. Save the filter preset to keep
these rules; temporary search graphs keep independent exclusions. For example:

```text
Todo
/^\d{2}$/
/^\d{4}-\d{2}-\d{2}$/
```

Plain phrases match complete names. Regex uses JavaScript syntax without appended
flags and ignores case, matching individual titles, names, or aliases after
character-width, case, and whitespace normalization. Use `^` and `$` for whole
names: the two-digit rule above preserves `101` and `Project 01`. Prefix an extra
`\` to enter literal names starting with `/` or `\`; existing phrases remain literal.
Exclusions do not directly remove nodes or explicit references.

Up to 2,000 phrases and 128 patterns are supported, each up to 256 characters
(excluding the regex delimiters). Invalid patterns report their line number.
Vocabulary preparation with regex stops after 10 seconds; simplify the rules and
apply again if it times out.

After typing pauses, preview how many names and original nodes match. **View details**
opens a searchable, paginated dialog with names, source documents, node IDs and
matching rules. Preview includes acquired workspace names outside the current scope;
it neither changes the graph nor estimates how many edges would be removed.

Use **Check a node or relationship** in the filter panel to explain an ID's exclusion,
document representation or display-only hiding. An optional second ID compares direct
relationships between the original endpoints with those between their display representatives.

## Data and limits

- Reads the local index without editing notes or relation fields. Appearance
  preferences are browser-local; JSON export creates a temporary workspace file.
- Read issues appear in a lower-left toast. **View details** opens a copyable
  diagnostic report; **Refresh** rereads the workspace.
- Duplicate block IDs retain one complete index row and report affected blocks.
  Copies may differ; open their sources from diagnostics to verify. Hop changes
  do not repair the source index; reread after the index updates.
- Supports keyword, query-syntax, regex, and compatible read-only SQL searches.
  Semantic search, encrypted-notebook search, and SQL that cannot be paginated
  reliably are unsupported. A search is limited to 500,000 matches, 10,000 pages,
  and two minutes; incomplete reads are reported explicitly.
- Verified with SiYuan 3.8.3 and HZ Simple Search 1.3.6 on Windows. Large-graph
  responsiveness depends on hardware, graph structure, and layout settings.

## Attribution

Original project code is MIT licensed; bundled libraries retain their own terms.

Visualization by [Cosmograph](https://cosmograph.app/), under
[CC BY-NC 4.0 / separate commercial terms](https://cosmograph.app/docs-general/citing-and-licensing/).
Its attribution remains visible. Other dependencies retain their licenses;
see [text-mention notices](../apps/siyuan-plugin/public/third-party-mentions.txt) and
[community notices](../apps/siyuan-plugin/public/third-party-communities.txt).
