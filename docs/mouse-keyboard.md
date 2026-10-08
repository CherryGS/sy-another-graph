# Mouse and keyboard

[User guide](user-guide.md) · [简体中文](mouse-keyboard_zh_CN.md)

These controls apply to Another Graph. SiYuan editor shortcuts still follow SiYuan's settings. Mouse actions use the left button unless stated otherwise. Background means canvas without a node, label, or relationship under the pointer.

## Open the graph

| Action                                                                   | Result                                                                      |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `Alt+Shift+G`; `Option+Shift+G` on macOS                                 | Open the graph. Change the command in SiYuan's shortcut settings if needed. |
| Click the plugin's toolbar icon                                          | Open the graph.                                                             |
| Document title, document tree, or block context menu → **View in graph** | Use that document or block as the initial scope.                            |
| **Graph all results** in native search                                   | Create a temporary search graph. Click again during reading to cancel.      |

## Nodes, selection, and inspection

Selected nodes are starting nodes for neighborhoods, layers, and other exploration. They have persistent labels and fixed positions. Inspection identifies the object whose details are open.

| Action                                    | Result                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Click a node or label                     | Select and inspect in ordinary single-select mode. In multi-select mode, only change inspection.       |
| `Shift-click` a node or label             | Add/remove it from the selected set and enter multi-select mode.                                       |
| Double-click a node or label              | Open its available SiYuan source. Synthetic nodes without a source do not open unrelated notes.        |
| Right-click a node or label → **Copy ID** | Copy its complete graph ID; native documents/blocks use SiYuan IDs. Preserve selection and inspection. |
| Hover a node or selected label            | Show its type, notebook, path, and other available context.                                            |
| Click a relationship                      | Inspect its actual endpoints without selecting them.                                                   |
| Click background                          | Clear selection and inspection in ordinary mode; only close inspection in multi-select mode.           |
| `Shift-double-click` background           | Clear all selected nodes, leave multi-select mode, and release fixed positions.                        |
| Toolbar **Clear selection**               | Clear selection, inspection, and current exploration; leave multi-select mode.                         |
| Inspector close button                    | Close the details without clearing the selected set.                                                   |
| Right-click background                    | Dismiss the node menu; no node operations appear.                                                      |

After entering multi-select mode, ordinary clicks only change inspection even when one selected node remains. Clear selection before returning to ordinary single selection.

## Move the graph in 2D and 3D

| Action                                                  | 2D                                                             | 3D                                            |
| ------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| Drag a node circle                                      | Move that node.                                                | Move it in the current view plane.            |
| `Shift-drag` from a selected circle or persistent label | Move every selected node, preserving their relative positions. | Move them together in the current view plane. |
| `Shift-drag` from an unselected node or background      | No camera movement or box selection.                           | No camera movement or box selection.          |
| Drag background                                         | Pan.                                                           | Rotate.                                       |
| Hold `Space` and drag                                   | Pan; starting on a circle does not drag the node.              | Pan the camera instead of dragging a node.    |
| Mouse wheel                                             | Zoom.                                                          | Move closer/farther.                          |
| `Ctrl+wheel` or supported trackpad pinch                | Zoom; Ctrl+wheel uses a larger step.                           | Same.                                         |
| Double-click background                                 | Zoom in.                                                       | Move closer.                                  |
| **Fit to canvas**                                       | Bring the current graph into view.                             | Same.                                         |
| **Rearrange layers and fit**                            | Restore layered positions and fit the graph.                   | Same.                                         |
| Pause/resume control                                    | Stop/resume Force motion.                                      | Same.                                         |

Background double-click also follows the normal background selection rules. Shift-double-click clears selection rather than zooming out. During a group drag, the camera stays still and wheel zoom is temporarily disabled. Selected nodes remain fixed after dragging; clearing selection releases them.

Start an ordinary node drag from its **circle**. Persistent selected labels support Shift-drag. Ordinary labels are not handles for panning the camera.

## Graph search and source previews

| Action                                                       | Result                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Enter a title or ID in graph search                          | Find nodes in the current graph; show the full match count with 50 results per page.       |
| Previous/next result page                                    | Show another page without limiting the available matches. A new query returns to page one. |
| Click a result                                               | Same selection/inspection rules as clicking a node.                                        |
| `Shift-click` a result                                       | Add/remove a selected node.                                                                |
| Double-click a result                                        | Open its source.                                                                           |
| `↓` in the search input                                      | Open results for a nonempty query and focus the first result.                              |
| `Tab / Shift+Tab` in results                                 | Move focus; `Enter / Space` activates a result.                                            |
| `Esc` in results                                             | Close results, restore input focus, and keep the query.                                    |
| Clear-search button                                          | Clear the query.                                                                           |
| Hover an inspector title, endpoint, or preview-enabled entry | Preview the original note; dragging suppresses preview.                                    |
| Click a node inspector title                                 | Open its source.                                                                           |
| Click a relationship entry in node details                   | Inspect the relationship; hover to preview its source.                                     |

Graph search locates nodes without replacing the graph with its results. [Native search graphs](user-guide.md#build-a-graph-from-search-results) use a separate temporary scope.

## Filters and presets

| Action                                                  | Result                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Filter: current preset name**                         | Open the current filter editor.                                                                   |
| Chevron next to Filter                                  | Open the preset chooser. Choose a preset to apply it, or use its edit/copy/rename/delete actions. |
| Click a sidebar category                                | Open Scope, Document exclusions, Relationships, Text mentions, Grouping, or Node display.         |
| Click the active category / collapse control            | Collapse content to the rail, keeping drafts.                                                     |
| `↑ / ↓` or `Home / End` on the category rail            | Move focus; `Enter / Space` opens or collapses the category.                                      |
| Back at the top of the rail                             | Return to the preset chooser.                                                                     |
| Close at the bottom / `Esc` in the editor               | Close and return focus to the toolbar. An upper dialog/menu handles Escape first.                 |
| Interact with the graph while the editor is open        | Keep the editor open and continue graph exploration.                                              |
| `Enter` in an exclusion textarea                        | Add a line; do not apply or submit.                                                               |
| **Apply exclusions**                                    | Apply valid drafts; both document-exclusion text fields apply together.                           |
| Click an exclusion step's title                         | Expand/collapse its rules or settings, keeping drafts.                                            |
| Drag a step handle / `↑ / ↓` on the handle              | Change execution order. Drag commits on release; keyboard changes apply immediately.              |
| Change an exclusion enabled/connection-retention switch | Recompute immediately. Save the preset to persist it; text drafts still need applying.            |
| **View details** on a step                              | Inspect removed/retained nodes; search, page, copy IDs, open sources, or locate a visible node.   |
| **Applied exclusions: relation impact**                 | Compare removed and added mentions on demand. Closing details stops and releases the comparison.  |
| **Update preset / Save as preset**                      | Save applied filters and grouping; do not apply drafts automatically.                             |
| Click a custom set's title                              | Expand/collapse its name and rules, keeping drafts.                                               |
| Drag a set handle                                       | Change overlap priority; the top matching enabled set owns a node. Commit on release.             |
| `↑ / ↓` on a set handle                                 | Move the set one position and update priority immediately.                                        |
| **Apply set**                                           | Apply its name and rules. Save the preset to persist them.                                        |
| Change a set's enabled switch                           | Reassign ownership in the existing order.                                                         |
| `Enter` in a naming dialog                              | Save; `Esc` or Cancel exits. Cancellation is disabled while saving.                               |
| Wheel over a panel, list, or inspector                  | Scroll that region without zooming the graph.                                                     |

Dots and **Not applied** identify drafts. Category changes and collapsing preserve them. Close, Back, and Escape offer **Continue editing** or **Discard drafts and exit** if needed. Escape inside that prompt keeps the drafts. Applied but unsaved changes remain and are marked **Preset not saved**.

Expanded filters temporarily hide inspection in narrow windows; closing/collapsing restores the same inspected object.

## Common keyboard controls

Focus the control first.

| Control               | Keys                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons and fields    | `Tab / Shift+Tab` moves focus.                                                                                                                                          |
| Button                | `Enter / Space` activates.                                                                                                                                              |
| Switch or checkbox    | `Space` toggles.                                                                                                                                                        |
| Select                | `Enter / Space` opens; arrows move; `Enter` chooses; `Esc` cancels. `Home / End` goes to the first/last item; typing can locate an option.                              |
| Menu                  | Arrows move, `Home / End` goes to the ends, `Enter / Space` activates, `Esc` closes.                                                                                    |
| Horizontal mode group | `← / →` moves focus; `Enter / Space` activates.                                                                                                                         |
| Settings tabs         | `← / →` switches; `Home / End` goes to the ends.                                                                                                                        |
| Slider                | Arrows adjust; `Shift+arrow` or `Page Up / Page Down` uses larger steps; `Home / End` reaches the limits. Drag commits on release; keyboard changes commit immediately. |
| Text input            | Normal editing shortcuts; Windows/Linux `Ctrl+A/C/X/V/Z` corresponds to macOS `Cmd+A/C/X/V/Z`.                                                                          |
| Dialog/popover        | `Esc` closes the top layer, subject to form/saving state and the control's prompts.                                                                                     |

Apart from the open-graph command, the plugin adds no global shortcuts for copying node IDs, refreshing, deleting, or pausing. Ctrl/Cmd+C remains text copy; use the node context menu for Copy ID.
