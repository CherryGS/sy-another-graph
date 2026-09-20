const NODE_LABEL_PREFIX = "ag-node-id--";

/** Carry the stable identity through the renderer's public label-class callback. */
export function nodeLabelClass(id: string): string {
  return NODE_LABEL_PREFIX + encodeURIComponent(id);
}

/** Undefined means canvas hit-testing is needed; null means an ineligible label. */
export function labelNodeId(
  target: Element | null,
  displayedIds: ReadonlyMap<string, number>,
): string | null | undefined {
  const chosen = target?.closest("[data-graph-node-id]");
  if (chosen) {
    const id = chosen.getAttribute("data-graph-node-id");
    return id && displayedIds.has(id) ? id : null;
  }
  const label = target?.closest(".css-label--label");
  if (!label) return undefined;
  const token = [...label.classList].find((name) => name.startsWith(NODE_LABEL_PREFIX));
  if (!token) return null;
  try {
    const id = decodeURIComponent(token.slice(NODE_LABEL_PREFIX.length));
    return displayedIds.has(id) ? id : null;
  } catch {
    return null;
  }
}
