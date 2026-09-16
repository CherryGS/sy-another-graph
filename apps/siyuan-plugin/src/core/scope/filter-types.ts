import type { ProjectionSpec } from "./rules";

/** Documents always remain available as representatives for hidden native blocks. */
export function isTypeHidden(filters: ProjectionSpec, type: string): boolean {
  return type !== "d" && (filters.documentsOnly || filters.hiddenTypes.includes(type));
}
