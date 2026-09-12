import type { CosmographConfig } from "@cosmograph/cosmograph";

export type LabelDensity = "standard" | "dense" | "high";

// Sampling and candidate limits both apply before label collision culling.
const LABEL_DENSITY_CONFIG = {
  standard: { showDynamicLabelsLimit: 40, selectedPointLabelsLimit: 100, pointSamplingDistance: 125 },
  dense: { showDynamicLabelsLimit: 240, selectedPointLabelsLimit: 240, pointSamplingDistance: 64 },
  high: { showDynamicLabelsLimit: 600, selectedPointLabelsLimit: 600, pointSamplingDistance: 40 },
} satisfies Record<LabelDensity, CosmographConfig>;

export interface GraphSettings {
  dimensions: 2 | 3;
  labelDensity: LabelDensity;
  communityEnabled: boolean;
  communityStrength: number;
  communityResolution: number;
  communityBackground: boolean;
  linkWidth: number;
  linkOpacity: number;
  showArrows: boolean;
  curvedLinks: boolean;
  scalePointsOnZoom: boolean;
  repulsion: number;
  gravity: number;
  linkDistance: number;
  linkSpring: number;
  friction: number;
  collision: number;
  collisionPadding: number;
  decay: number;
  depthFade: number;
  sphereShading: boolean;
}

export const DEFAULT_GRAPH_SETTINGS: Readonly<GraphSettings> = {
  dimensions: 2,
  labelDensity: "dense",
  communityEnabled: false,
  communityStrength: 0.15,
  communityResolution: 1,
  communityBackground: false,
  linkWidth: 1,
  linkOpacity: 0.88,
  showArrows: true,
  curvedLinks: false,
  scalePointsOnZoom: false,
  repulsion: 0.8,
  gravity: 0.12,
  linkDistance: 12,
  linkSpring: 0.4,
  friction: 0.85,
  collision: 0,
  collisionPadding: 0,
  decay: 5000,
  depthFade: 0.4,
  sphereShading: true,
};

/** UI ranges are also enforced at the renderer boundary. Space/GPU allocation limits stay fixed. */
export const GRAPH_SETTING_RANGES = {
  communityStrength: { min: 0, max: 1, step: 0.01 },
  communityResolution: { min: 0.25, max: 4, step: 0.25 },
  linkWidth: { min: 0.25, max: 4, step: 0.05 },
  linkOpacity: { min: 0.05, max: 1, step: 0.05 },
  repulsion: { min: 0, max: 4, step: 0.05 },
  gravity: { min: 0, max: 1, step: 0.01 },
  linkDistance: { min: 2, max: 120, step: 1 },
  linkSpring: { min: 0, max: 2, step: 0.05 },
  friction: { min: 0, max: 0.99, step: 0.01 },
  collision: { min: 0, max: 1, step: 0.05 },
  collisionPadding: { min: 0, max: 10, step: 0.5 },
  decay: { min: 500, max: 20000, step: 500 },
  depthFade: { min: 0, max: 1, step: 0.05 },
} as const;

export function normalizeGraphSettings(settings?: Partial<GraphSettings>): GraphSettings {
  const result = { ...DEFAULT_GRAPH_SETTINGS };
  if (!settings) return result;
  result.dimensions = settings.dimensions === 3 ? 3 : 2;
  if (settings.labelDensity === "standard" || settings.labelDensity === "dense" || settings.labelDensity === "high")
    result.labelDensity = settings.labelDensity;
  for (const key of ["showArrows", "curvedLinks", "scalePointsOnZoom", "sphereShading", "communityEnabled", "communityBackground"] as const)
    if (typeof settings[key] === "boolean") result[key] = settings[key];
  for (const key of Object.keys(GRAPH_SETTING_RANGES) as (keyof typeof GRAPH_SETTING_RANGES)[]) {
    const value = settings[key];
    const { min, max } = GRAPH_SETTING_RANGES[key];
    if (typeof value === "number" && Number.isFinite(value))
      result[key] = Math.min(max, Math.max(min, value));
  }
  return result;
}

export function graphSettingsConfig(settings?: Partial<GraphSettings>): CosmographConfig {
  const value = normalizeGraphSettings(settings);
  return {
    spaceDimensions: value.dimensions,
    simulationCluster: value.communityEnabled ? value.communityStrength : 0,
    backgroundColor: value.communityEnabled && value.communityBackground && value.dimensions === 2 ? "#11121a00" : "#11121a",
    ...LABEL_DENSITY_CONFIG[value.labelDensity],
    linkWidthScale: value.linkWidth,
    linkOpacity: value.linkOpacity,
    linkDefaultArrows: value.showArrows,
    curvedLinks: value.curvedLinks,
    scalePointsOnZoom: value.scalePointsOnZoom,
    simulationRepulsion: value.repulsion,
    simulationGravity: value.gravity,
    simulationLinkDistance: value.linkDistance,
    simulationLinkSpring: value.linkSpring,
    simulationFriction: value.friction,
    simulationCollision: value.collision,
    simulationCollisionPadding: value.collisionPadding,
    simulationDecay: value.decay,
    pointDepthFade: value.depthFade,
    pointSphereShading: value.sphereShading,
  };
}
