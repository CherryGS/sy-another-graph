# Atlas · SiYuan Graph

Explore SiYuan document graphs with Cosmograph, a Rust WASM engine, and a React
workbench.

## Use

Enable the plugin and click the Atlas toolbar icon, or press Alt+Shift+G.
Search for documents, filter notebooks and relation types, inspect nodes, open
documents, focus neighborhoods, or find connecting paths.

Insights show graph structure and measured runtime information. Saved views
retain filters, selected documents, and data-source identity in the current
browser. Synthetic scale fixtures are clearly labeled and do not modify notes.

## Runtime

Graph acquisition is read-only. Renderer and database resources are bundled
locally. The default computation path is a Rust WASM Worker with transferable
buffers; shared-buffer transport requires a cross-origin isolated host.

Neighborhood and path views use the full graph. Neighborhoods explicitly report
their 10,000-node projection budget. The source graph itself is not clipped to
that view budget.

This development build was verified in the supplied SiYuan 3.8.3 WebUI.
Author/repository metadata and marketplace publication are not configured.

## Attribution

Visualization by [Cosmograph](https://cosmograph.app/), licensed under
[CC BY-NC 4.0 / separate commercial terms](https://cosmograph.app/docs-general/citing-and-licensing/).
Its attribution remains visible. React, TanStack Router, DuckDB-WASM, Apache
Arrow, and other dependencies retain their respective licenses.
