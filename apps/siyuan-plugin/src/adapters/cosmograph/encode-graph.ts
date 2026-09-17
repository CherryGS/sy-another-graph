import { Table, tableFromArrays, tableToIPC, vectorFromArray, Utf8 } from "apache-arrow";
import { EDGE_COLORS, type GraphColumns, type GraphIPC } from "./preparation-protocol";

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Worker-only CPU work. Cancellation terminates the worker instead of queuing behind encoding. */
export function encodeGraph(columns: GraphColumns): GraphIPC {
  const started = performance.now();
  const { points: input, links: edges } = columns;
  const index = Uint32Array.from({ length: input.id.length }, (_, position) => position);
  const labelWeight = input.degree.slice();
  let maximumDegree = 0;
  for (const value of input.degree) maximumDegree = Math.max(maximumDegree, value);
  for (const position of input.accentedIndices) labelWeight[position] += maximumDegree + 1;
  const points = tableFromArrays({
    id: input.id,
    // Even sanitized HTML labels can issue network requests; preserve titles as literal text.
    label: input.label.map((label) =>
      label.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]),
    ),
    notebook: input.notebook,
    color: input.color,
    branchColor: input.branchColor,
    degreeColor: input.degreeColor,
    typeColor: input.typeColor,
    index,
    degree: input.degree,
    labelWeight,
  });
  const source = Array.from(edges.sourceIndex, (position) => input.id[position]);
  const target = Array.from(edges.targetIndex, (position) => input.id[position]);
  const color = Array.from(edges.colorIndex, (position) => EDGE_COLORS[position]);
  // Keep the schema even for a zero-edge graph: the renderer still queries the link table.
  const links = new Table({
    source: vectorFromArray(source, new Utf8()),
    target: vectorFromArray(target, new Utf8()),
    sourceIndex: vectorFromArray(edges.sourceIndex),
    targetIndex: vectorFromArray(edges.targetIndex),
    color: vectorFromArray(color, new Utf8()),
    weight: vectorFromArray(edges.weight),
    width: vectorFromArray(edges.width),
    style: vectorFromArray(edges.style),
  });
  return {
    points: tableToIPC(points, "stream"),
    links: tableToIPC(links, "stream"),
    encodingMs: performance.now() - started,
  };
}
