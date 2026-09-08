import { DEFAULT_FILTERS, type GraphDataset, type GraphFilters } from "./types";

export interface SavedView {
  id: string;
  name: string;
  createdAt: string;
  filters: GraphFilters;
  selectedId: string | null;
  source: "siyuan" | "demo";
  datasetKey?: "siyuan" | "10000" | "100000";
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
      (edge.kind === "reference" ? filters.references : filters.hierarchy),
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
          (item.source === "siyuan" || item.source === "demo") &&
          typeof item.filters?.query === "string" &&
          typeof item.filters?.notebook === "string" &&
          typeof item.filters?.references === "boolean" &&
          typeof item.filters?.hierarchy === "boolean" &&
          typeof item.filters?.hideIsolated === "boolean" &&
          (item.selectedId === null || typeof item.selectedId === "string") &&
          (item.datasetKey === undefined ||
            (item.source === "siyuan"
              ? item.datasetKey === "siyuan"
              : ["10000", "100000"].includes(item.datasetKey))),
      )
      .slice(0, 50);
  } catch {
    return [];
  }
}

export function newSavedView(
  name: string,
  filters: GraphFilters,
  selectedId: string | null,
  source: "siyuan" | "demo",
  datasetKey?: SavedView["datasetKey"],
): SavedView {
  return {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 80) || "未命名视图",
    createdAt: new Date().toISOString(),
    filters: { ...DEFAULT_FILTERS, ...filters },
    selectedId,
    source,
    datasetKey,
  };
}
