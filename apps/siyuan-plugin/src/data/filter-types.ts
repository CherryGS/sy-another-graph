import type { GraphFilters } from "./types";

/** Documents always remain available as representatives for hidden native blocks. */
export function isTypeHidden(
  filters: Pick<GraphFilters, "documentsOnly" | "hiddenTypes">,
  type: string,
): boolean {
  return type !== "d" && (filters.documentsOnly || filters.hiddenTypes.includes(type));
}
