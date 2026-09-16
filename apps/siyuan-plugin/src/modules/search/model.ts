export const MAX_SEARCH_RESULTS = 500_000;
const NATIVE_ID = /^\d{14}-[a-z0-9]{7}$/;

/** An in-memory result snapshot, deliberately outside the persisted preset schema. */
export interface SearchGraphSnapshot {
  requestId: string;
  label: string;
  query: string;
  ids: string[];
}

export function readSearchSnapshot(value: unknown): SearchGraphSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<SearchGraphSnapshot>;
  if (
    typeof item.requestId !== "string" ||
    !item.requestId ||
    item.requestId.length > 80 ||
    typeof item.label !== "string" ||
    item.label.length > 160 ||
    typeof item.query !== "string" ||
    item.query.length > 100_000 ||
    !Array.isArray(item.ids) ||
    !item.ids.length ||
    item.ids.length > MAX_SEARCH_RESULTS ||
    !item.ids.every((id) => typeof id === "string" && NATIVE_ID.test(id))
  )
    return null;
  return {
    requestId: item.requestId,
    label: item.label,
    query: item.query,
    ids: [...new Set(item.ids)],
  };
}
