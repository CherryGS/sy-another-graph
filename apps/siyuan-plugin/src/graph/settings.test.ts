import { describe, expect, it } from "vitest";
import { defaultCosmographConfig } from "@cosmograph/cosmograph/cosmograph/config/defaults.js";
import {
  DEFAULT_GRAPH_SETTINGS,
  GRAPH_SETTING_RANGES,
  graphSettingsConfig,
  normalizeGraphSettings,
} from "./settings";

describe("graph settings", () => {
  it("preserves the installed Cosmograph spring default and the workbench's existing force overrides", () => {
    expect(DEFAULT_GRAPH_SETTINGS.linkSpring).toBe(defaultCosmographConfig.simulationLinkSpring);
    expect(graphSettingsConfig()).toMatchObject({
      simulationLinkSpring: defaultCosmographConfig.simulationLinkSpring,
      simulationRepulsion: 0.8,
      simulationGravity: 0.12,
      simulationLinkDistance: 12,
      simulationFriction: 0.85,
      simulationCollision: 0,
      simulationCollisionPadding: 0,
      simulationDecay: 5000,
    });
  });

  it("keeps invalid or nonfinite persisted values out of the renderer", () => {
    const normalized = normalizeGraphSettings({
      dimensions: 3,
      repulsion: Infinity,
      gravity: -2,
      friction: 5,
      decay: NaN,
      linkWidth: 100,
    });
    expect(normalized.dimensions).toBe(3);
    expect(normalized.repulsion).toBe(DEFAULT_GRAPH_SETTINGS.repulsion);
    expect(normalized.gravity).toBe(0);
    expect(normalized.friction).toBe(0.99);
    expect(normalized.decay).toBe(DEFAULT_GRAPH_SETTINGS.decay);
    expect(normalized.linkWidth).toBe(4);
    for (const [key, range] of Object.entries(GRAPH_SETTING_RANGES)) {
      const value = DEFAULT_GRAPH_SETTINGS[key as keyof typeof GRAPH_SETTING_RANGES];
      expect(value).toBeGreaterThanOrEqual(range.min);
      expect(value).toBeLessThanOrEqual(range.max);
    }
  });

  it("maps display and force controls to supported config without changing graph semantics", () => {
    const config = graphSettingsConfig({
      dimensions: 3,
      showArrows: false,
      curvedLinks: true,
      collision: 0.5,
      collisionPadding: 4,
      linkWidth: 2,
      decay: 8000,
    });
    expect(config).toMatchObject({
      spaceDimensions: 3,
      linkDefaultArrows: false,
      curvedLinks: true,
      simulationCollision: 0.5,
      simulationCollisionPadding: 4,
      linkWidthScale: 2,
      simulationDecay: 8000,
    });
    expect(config).not.toHaveProperty("points");
    expect(config).not.toHaveProperty("links");
    expect(config).not.toHaveProperty("enableSimulation");
    expect(config).not.toHaveProperty("spaceSize");
  });
});
