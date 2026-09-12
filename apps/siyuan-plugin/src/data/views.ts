import { DEFAULT_FILTERS, type GraphDataset, type GraphFilters } from "./types";
import { isMentionMode } from "../mentions/types";

const NATIVE_ID = /^\d{14}-[a-z0-9]{7}$/;

export interface SavedView {
  id: string;
  name: string;
  createdAt: string;
  filters: GraphFilters;
  selectedId: string | null;
  chosenIds?: string[];
  multiple?: boolean;
  source: "siyuan";
}

export function filterGraph(
  data: GraphDataset,
  filters: GraphFilters,
  focus: Set<number> | null = null,
) {
  let nodes = data.nodes.filter(
    (node) =>
      (!filters.notebook || node.notebook === filters.notebook) &&
      (!focus || focus.has(node.index)),
  );
  const indices = new Set(nodes.map((node) => node.index));
  const edges = data.edges.filter(
    (edge) =>
      indices.has(edge.source) &&
      indices.has(edge.target) &&
      (edge.kind === "text-mention"
        ? filters.mentions !== "off"
        : edge.kind === "reference"
        ? filters.references
        : edge.kind === "hierarchy"
          ? filters.hierarchy
          : filters.databases),
  );
  if (filters.hideIsolated) {
    const connected = new Set<number>();
    for (const edge of edges) {
      connected.add(edge.source);
      connected.add(edge.target);
    }
    nodes = nodes.filter((node) => connected.has(node.index));
  }
  return { nodes, edges };
}

export function readSavedViews(
  storage?: Pick<Storage, "getItem">,
): SavedView[] {
  try {
    const parsed: unknown = JSON.parse(
      (storage ?? localStorage).getItem("sy-another-graph:views") ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SavedView =>
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.createdAt === "string" &&
          item.source === "siyuan" &&
          typeof item.filters?.query === "string" &&
          typeof item.filters?.notebook === "string" &&
          typeof item.filters?.references === "boolean" &&
          typeof item.filters?.hierarchy === "boolean" &&
          typeof item.filters?.hideIsolated === "boolean" &&
          (item.filters.scopeId === undefined ||
            item.filters.scopeId === "" ||
            (typeof item.filters.scopeId === "string" &&
              NATIVE_ID.test(item.filters.scopeId))) &&
          (item.filters.includeChildDocuments === undefined ||
            typeof item.filters.includeChildDocuments === "boolean") &&
          (item.filters.databases === undefined ||
            typeof item.filters.databases === "boolean") &&
          (item.filters.documentsOnly === undefined ||
            typeof item.filters.documentsOnly === "boolean") &&
          (item.filters.mentions === undefined || isMentionMode(item.filters.mentions)) &&
          (item.filters.excludeIds === undefined ||
            (Array.isArray(item.filters.excludeIds) &&
              item.filters.excludeIds.every(
                (id: unknown) => typeof id === "string" && NATIVE_ID.test(id),
              ))) &&
          (item.filters.hiddenTypes === undefined ||
            (Array.isArray(item.filters.hiddenTypes) &&
              item.filters.hiddenTypes.every(
                (type: unknown) =>
                  typeof type === "string" && type.trim().length > 0,
              ))) &&
          (item.selectedId === null || typeof item.selectedId === "string") &&
          (item.chosenIds === undefined || (Array.isArray(item.chosenIds) && item.chosenIds.every((id: unknown) => typeof id === "string"))) &&
          (item.multiple === undefined || typeof item.multiple === "boolean") &&
          // The old schema carried a dataset key. Migrate only genuine SiYuan
          // views; never relabel a legacy generated dataset as workspace data.
          (item.datasetKey === undefined || item.datasetKey === "siyuan"),
      )
      .slice(0, 50)
      .map((item) => ({
        id: item.id,
        name: item.name,
        createdAt: item.createdAt,
        filters: {
          ...DEFAULT_FILTERS,
          query: item.filters.query,
          notebook: item.filters.notebook,
          references: item.filters.references,
          hierarchy: item.filters.hierarchy,
          hideIsolated: item.filters.hideIsolated,
          scopeId: item.filters.scopeId ?? "",
          includeChildDocuments:
            item.filters.includeChildDocuments ??
            DEFAULT_FILTERS.includeChildDocuments,
          databases: item.filters.databases ?? true,
          mentions: item.filters.mentions ?? "off",
          excludeIds: [...(item.filters.excludeIds ?? [])],
          // Older views express their type choices solely through hiddenTypes.
          documentsOnly: item.filters.documentsOnly ?? false,
          hiddenTypes: [...(item.filters.hiddenTypes ?? [])],
        },
        selectedId: item.selectedId,
        ...(item.chosenIds ? { chosenIds: [...new Set(item.chosenIds)] } : {}),
        ...(item.multiple !== undefined ? { multiple: item.multiple } : {}),
        source: "siyuan",
      }));
  } catch {
    return [];
  }
}

export function newSavedView(
  name: string,
  filters: GraphFilters,
  selectedId: string | null,
  selection?: { chosenIds: readonly string[]; multiple: boolean },
): SavedView {
  return {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 80) || "未命名视图",
    createdAt: new Date().toISOString(),
    filters: {
      ...DEFAULT_FILTERS,
      ...filters,
      excludeIds: [...filters.excludeIds],
      hiddenTypes: [...filters.hiddenTypes],
    },
    selectedId,
    ...(selection ? { chosenIds: [...selection.chosenIds], multiple: selection.multiple } : {}),
    source: "siyuan",
  };
}
