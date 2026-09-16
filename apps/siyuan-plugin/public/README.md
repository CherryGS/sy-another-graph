# 一个思源图谱

Explore connections between SiYuan notes, blocks, and search results in 2D or 3D.

[简体中文](README_zh_CN.md)

## Start exploring

Requires desktop SiYuan **3.8.3+**. Enable the plugin, then click its toolbar icon
or press **Alt+Shift+G**. Use **View in graph** from a document title, document tree,
or block context menu to start from specific content.

The default view shows documents and references. Open **Filter** to adjust the
scope, block types, and relations, or save a named preset.

The interface follows SiYuan's language. Chinese variants use Simplified Chinese;
other languages use English. Note titles, aliases, excluded phrases and existing
preset names keep their original text.

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
- **Trace sources:** preview or open original blocks and inspect relationship evidence.
- **Add relations:** enable containment, database connections, or text mentions
  derived from document titles, names, and aliases.
- **Adjust the view:** switch 2D/3D, tune forces and labels, cluster communities,
  or show optional community territories in 2D.
- **Export:** download the visible graph as JSON.

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
see [text-mention notices](third-party-mentions.txt) and
[community notices](third-party-communities.txt).
