export type GraphColorMode = "notebook" | "branch" | "degree";

interface ColorNode {
  notebook: string;
  path: string;
  degree: number;
  color: string;
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
export function nodeColor(node: ColorNode, mode: GraphColorMode): string {
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
