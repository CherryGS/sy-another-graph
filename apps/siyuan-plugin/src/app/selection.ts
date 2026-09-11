export interface GraphSelection {
  chosenIds: string[];
  inspectedId: string | null;
  multiple: boolean;
}

export const EMPTY_SELECTION: GraphSelection = {
  chosenIds: [],
  inspectedId: null,
  multiple: false,
};

/** Shift changes S; ordinary clicks inspect without replacing an active multi-selection. */
export function selectNode(
  previous: GraphSelection,
  id: string | null,
  shiftKey = false,
): GraphSelection {
  if (id === null)
    return previous.multiple
      ? { ...previous, inspectedId: null }
      : { ...EMPTY_SELECTION };
  if (shiftKey) {
    const chosenIds = previous.chosenIds.includes(id)
      ? previous.chosenIds.filter((chosen) => chosen !== id)
      : [...previous.chosenIds, id];
    return { chosenIds, inspectedId: id, multiple: chosenIds.length > 0 };
  }
  return previous.multiple
    ? { ...previous, inspectedId: id }
    : { chosenIds: [id], inspectedId: id, multiple: false };
}

/** Type hiding removes original choices instead of transferring them to a document. */
export function retainSelection(
  previous: GraphSelection,
  eligibleIds: ReadonlySet<string>,
): GraphSelection {
  const chosenIds = previous.chosenIds.filter((id) => eligibleIds.has(id));
  const inspectedId =
    previous.inspectedId && eligibleIds.has(previous.inspectedId)
      ? previous.inspectedId
      : null;
  if (
    chosenIds.length === previous.chosenIds.length &&
    inspectedId === previous.inspectedId
  )
    return previous;
  return {
    chosenIds,
    inspectedId,
    multiple: previous.multiple && chosenIds.length > 0,
  };
}

/** Preserve the actual activation set in saved selected-mention views. Legacy
 * views retain their former single-selection behavior. */
export function restoreSelection(
  saved: { selectedId: string | null; chosenIds?: readonly string[]; multiple?: boolean },
  eligibleIds: ReadonlySet<string>,
): GraphSelection {
  const chosenIds = [...new Set(saved.chosenIds ?? (saved.selectedId ? [saved.selectedId] : []))];
  return retainSelection({ chosenIds, inspectedId: saved.selectedId, multiple: saved.multiple ?? chosenIds.length > 1 }, eligibleIds);
}
