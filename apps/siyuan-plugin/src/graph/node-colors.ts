import type { GraphNode } from "../data/types";
import { nodeType } from "../data/graph-model";

export type GraphColorMode = "type" | "notebook" | "branch" | "degree";

export const NODE_TYPE_COLORS: Readonly<Record<string, string>> = {
  d: "#65b8ff", p: "#69d6b4", h: "#ffc56a", l: "#be9aff", i: "#a5d778",
  b: "#ee96bc", s: "#a2abc1", c: "#f28d70", m: "#75d6e7", t: "#d6c26d",
  tb: "#8696a8", html: "#c792ea", iframe: "#82b1ca", video: "#ed799c",
  audio: "#d49b6a", widget: "#9fbcdf", query_embed: "#b6be77", av: "#9fd0ce",
  database: "#dbabef", "database-item": "#f0b59b",
};

export function nodeTypeColor(type: string): string {
  if (Object.hasOwn(NODE_TYPE_COLORS, type)) return NODE_TYPE_COLORS[type];
  let hash = 2166136261;
  for (let index = 0; index < type.length; index++) hash = Math.imul(hash ^ type.charCodeAt(index), 16777619);
  return BRANCH_COLORS[(hash >>> 0) % BRANCH_COLORS.length];
}

const BRANCH_COLORS = [
  "#7eb8da",
  "#b09ddd",
  "#73c8a8",
  "#dfa873",
  "#d68fa9",
  "#a9bc72",
  "#77c9d0",
  "#cfa4d0",
  "#d4bd87",
  "#92a7db",
];
const DEGREE_COLORS = [
  [101, 134, 201],
  [98, 201, 210],
  [230, 197, 106],
  [237, 135, 154],
];

/** Shared by the canvas and document accents; colors do not change when filtering. */
export function nodeColor(node: GraphNode, mode: GraphColorMode): string {
  if (mode === "type") return nodeTypeColor(nodeType(node));
  if (mode === "notebook") return node.color;
  if (mode === "degree") {
    const degree = Number.isFinite(node.degree) ? Math.max(0, node.degree) : 0;
    // Log spacing keeps low-degree notes distinguishable from highly connected hubs.
    const position =
      Math.min(1, Math.log2(degree + 1) / 8) * (DEGREE_COLORS.length - 1);
    const lower = Math.min(Math.floor(position), DEGREE_COLORS.length - 2);
    const fraction = position - lower;
    const rgb = DEGREE_COLORS[lower].map((channel, index) =>
      Math.round(
        channel + (DEGREE_COLORS[lower + 1][index] - channel) * fraction,
      )
        .toString(16)
        .padStart(2, "0"),
    );
    return `#${rgb.join("")}`;
  }
  const segments = node.path.split("/").filter(Boolean);
  if (!segments.length) return node.color;
  // Group the first child below a root document with its descendants.
  const branch = segments[Math.min(1, segments.length - 1)].replace(
    /\.sy$/i,
    "",
  );
  const key = `${node.notebook}/${segments[0].replace(/\.sy$/i, "")}/${branch}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++)
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  return BRANCH_COLORS[(hash >>> 0) % BRANCH_COLORS.length];
}
