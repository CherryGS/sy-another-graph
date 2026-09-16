import type { CosmographConfig } from "@cosmograph/cosmograph";
import { graphSettingsConfig } from "../../workbench/presentation/settings";
import type { GraphCanvasProps } from "../../workbench/presentation/types";

type DisplayOptions = Pick<
  GraphCanvasProps,
  "settings" | "colorBy" | "showLabels" | "showLinks" | "pointSize"
> & { pointsCount: number };

/** Compose the actual display update in one place so density defaults cannot override controls. */
export function displayConfig({
  settings,
  colorBy = "type",
  showLabels,
  showLinks,
  pointSize,
  pointsCount,
}: DisplayOptions): CosmographConfig {
  const dense = pointsCount > 20_000;
  return {
    pointColorBy: colorBy === "notebook" ? "color" : `${colorBy}Color`,
    showLabels,
    renderLinks: showLinks,
    linkArrowsSizeScale: dense ? 1.6 : 2.6,
    linkVisibilityDistanceRange: dense ? [50, 150] : [200, 700],
    linkVisibilityMinTransparency: dense ? 0.25 : 0.8,
    pointSizeRange: [Math.max(1, pointSize), Math.max(2, pointSize * 2.8)],
    ...graphSettingsConfig(settings),
  };
}
