import type { GraphProjectionRules } from "../../core/scope/rules";

export const EXCLUSION_STEPS = ["subtree", "document", "empty"] as const;
export type ExclusionStep = (typeof EXCLUSION_STEPS)[number];
export interface ExclusionPipeline {
  order: ExclusionStep[];
  enabled: Record<ExclusionStep, boolean>;
  preserveConnections: boolean;
}
export interface ExclusionContext {
  pipeline: ExclusionPipeline;
  projection: GraphProjectionRules;
  searchIds?: readonly string[];
}
export const defaultExclusionPipeline = (): ExclusionPipeline => ({
  order: [...EXCLUSION_STEPS],
  enabled: { subtree: true, document: true, empty: false },
  preserveConnections: true,
});
export function copyExclusionPipeline(
  value: ExclusionPipeline = defaultExclusionPipeline(),
): ExclusionPipeline {
  return {
    order: [...value.order],
    enabled: { ...value.enabled },
    preserveConnections: value.preserveConnections,
  };
}
export function readExclusionPipeline(value: unknown): ExclusionPipeline | null {
  if (value === undefined) return defaultExclusionPipeline();
  if (!value || typeof value !== "object") return null;
  const item = value as ExclusionPipeline;
  if (
    !Array.isArray(item.order) ||
    item.order.length !== 3 ||
    new Set(item.order).size !== 3 ||
    !item.order.every((step) => EXCLUSION_STEPS.includes(step)) ||
    !item.enabled ||
    EXCLUSION_STEPS.some((step) => typeof item.enabled[step] !== "boolean") ||
    typeof item.preserveConnections !== "boolean"
  )
    return null;
  return copyExclusionPipeline(item);
}
export function moveExclusionStep(
  value: ExclusionPipeline,
  step: string,
  destination: number,
): ExclusionPipeline {
  const order = [...value.order],
    index = order.indexOf(step as ExclusionStep);
  if (index < 0 || destination < 0 || destination >= order.length || index === destination)
    return value;
  order.splice(index, 1);
  order.splice(destination, 0, step as ExclusionStep);
  return { ...value, order };
}
