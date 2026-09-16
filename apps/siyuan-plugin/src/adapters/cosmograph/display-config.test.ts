import { describe, expect, it } from "vitest";
import { displayConfig } from "./display-config";
import { DEFAULT_GRAPH_SETTINGS } from "../../workbench/presentation/settings";

describe("display config composition", () => {
  it.each([1000, 25000])(
    "applies requested width and opacity to a %s-point graph",
    (pointsCount) => {
      const config = displayConfig({
        pointsCount,
        settings: {
          ...DEFAULT_GRAPH_SETTINGS,
          linkWidth: 2.5,
          linkOpacity: 0.35,
          dimensions: 3,
          labelDensity: "high",
        },
        colorBy: "type",
        showLabels: false,
        showLinks: true,
        pointSize: 6,
      });
      expect(config).toMatchObject({
        linkWidthScale: 2.5,
        linkOpacity: 0.35,
        spaceDimensions: 3,
        pointColorBy: "typeColor",
        showLabels: false,
        renderLinks: true,
        showDynamicLabelsLimit: 600,
        selectedPointLabelsLimit: 600,
        pointSamplingDistance: 40,
      });
    },
  );
});
