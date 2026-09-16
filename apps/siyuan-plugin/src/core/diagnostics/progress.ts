export type SourceProgress =
  | { phase: "preparing" | "notebooks" }
  | { phase: "blocks" | "databases"; completed: number; total: number }
  | { phase: "references"; completed: number; total: number; groups: number };
