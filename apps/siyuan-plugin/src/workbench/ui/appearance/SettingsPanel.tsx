import { useLocale } from "../../../shared/i18n/react";
import { t } from "../../../shared/i18n/runtime";
import { useEffect, useState } from "react";
import { RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/shared/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Slider } from "@/shared/ui/slider";
import { Switch } from "@/shared/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { GRAPH_SETTING_RANGES } from "../../presentation/settings";
import type { GraphColorMode } from "../../presentation/node-colors";
import type { WorkbenchState } from "../../model/state";

function SettingSlider({
  name,
  value,
  range,
  onCommit,
  description,
}: {
  name: string;
  value: number;
  range: { min: number; max: number; step: number };
  onCommit: (value: number) => void;
  description?: string;
}) {
  useLocale();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Reset/restore updates the slider without replacing its focused thumb.
    setDraft(value);
  }, [value]);
  return (
    <Field>
      <div className="flex items-center justify-between gap-4">
        <FieldLabel>{name}</FieldLabel>
        <output className="text-sm tabular-nums text-muted-foreground">{draft}</output>
      </div>
      <Slider
        aria-label={name}
        {...range}
        value={[draft]}
        onValueChange={([next]) => setDraft(next)}
        onValueCommit={([next]) => onCommit(next)}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
}

export function SettingSwitch({
  id,
  name,
  checked,
  onChange,
  disabled = false,
}: {
  id: string;
  name: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  useLocale();
  return (
    <Field orientation="horizontal" data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{name}</FieldLabel>
      <Switch id={id} disabled={disabled} checked={checked} onCheckedChange={onChange} />
    </Field>
  );
}

export function SettingsPanel({ state }: { state: WorkbenchState }) {
  useLocale();
  const settings = state.graphSettings;
  const parameter = (
    key: keyof typeof GRAPH_SETTING_RANGES,
    name: string,
    description?: string,
  ) => (
    <SettingSlider
      key={key}
      name={name}
      value={settings[key]}
      range={GRAPH_SETTING_RANGES[key]}
      onCommit={(value) => state.setGraphSettings({ [key]: value })}
      description={description}
    />
  );
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("text.graphSettings")}
          title={t("text.graphSettings")}
        >
          <Settings2 />
        </Button>
      </SheetTrigger>
      <SheetContent className="settings-sheet gap-0">
        <SheetHeader>
          <SheetTitle>{t("text.graphSettings")}</SheetTitle>
          <SheetDescription>
            {t("text.appearanceAndLayoutPreferencesAreSavedInThis")}
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="appearance" className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="mx-4 mb-4">
            <TabsTrigger value="appearance">{t("settings.display")}</TabsTrigger>
            <TabsTrigger value="simulation">{t("text.forces")}</TabsTrigger>
            <TabsTrigger value="spatial">{t("text.3d")}</TabsTrigger>
          </TabsList>
          <ScrollArea className="min-h-0 flex-1" data-scroll-panel>
            <TabsContent value="appearance" className="m-0 p-4 pt-0">
              <FieldGroup>
                <FieldSet>
                  <FieldLegend>{t("text.nodes3")}</FieldLegend>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="node-colors">{t("text.nodeColor")}</FieldLabel>
                      <Select
                        value={state.colorBy}
                        onValueChange={(value) => state.setColorBy(value as GraphColorMode)}
                      >
                        <SelectTrigger id="node-colors" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="type">{t("text.byNodeType")}</SelectItem>
                            <SelectItem value="branch">{t("text.byDocumentBranch")}</SelectItem>
                            <SelectItem value="notebook">{t("text.byNotebook")}</SelectItem>
                            <SelectItem value="degree">{t("text.byDegree")}</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <SettingSlider
                      name={t("text.nodeSize")}
                      value={state.pointSize}
                      range={{ min: 1, max: 10, step: 0.5 }}
                      onCommit={state.setPointSize}
                    />
                    <SettingSwitch
                      id="show-labels"
                      name={t("text.showLabels")}
                      checked={state.showLabels}
                      onChange={state.setShowLabels}
                    />
                    <Field data-disabled={!state.showLabels}>
                      <FieldLabel id="label-density-label">{t("text.labelDensity")}</FieldLabel>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        className="w-full"
                        aria-labelledby="label-density-label"
                        aria-describedby="label-density-description"
                        disabled={!state.showLabels}
                        value={settings.labelDensity}
                        onValueChange={(labelDensity) => {
                          if (
                            labelDensity === "standard" ||
                            labelDensity === "dense" ||
                            labelDensity === "high"
                          )
                            state.setGraphSettings({ labelDensity });
                        }}
                      >
                        <ToggleGroupItem value="standard" className="flex-1">
                          {t("text.standard")}
                        </ToggleGroupItem>
                        <ToggleGroupItem value="dense" className="flex-1">
                          {t("text.more")}
                        </ToggleGroupItem>
                        <ToggleGroupItem value="high" className="flex-1">
                          {t("text.dense")}
                        </ToggleGroupItem>
                      </ToggleGroup>
                      <FieldDescription id="label-density-description">
                        {t("text.higherDensityShowsMoreLabelsWhileStillAvoiding")}
                      </FieldDescription>
                    </Field>
                    <SettingSwitch
                      id="scale-points"
                      name={t("text.scaleNodesWithZoom")}
                      checked={settings.scalePointsOnZoom}
                      onChange={(scalePointsOnZoom) =>
                        state.setGraphSettings({ scalePointsOnZoom })
                      }
                    />
                  </FieldGroup>
                </FieldSet>
                <FieldSet>
                  <FieldLegend>{t("text.links")}</FieldLegend>
                  <FieldGroup>
                    <SettingSwitch
                      id="show-links"
                      name={t("text.showLinks")}
                      checked={state.showLinks}
                      onChange={state.setShowLinks}
                    />
                    {parameter("linkWidth", t("text.linkWidth"))}
                    {parameter("linkOpacity", t("text.linkOpacity"))}
                    <SettingSwitch
                      id="show-arrows"
                      name={t("text.showDirectionArrows")}
                      checked={settings.showArrows}
                      onChange={(showArrows) => state.setGraphSettings({ showArrows })}
                    />
                    <SettingSwitch
                      id="curved-links"
                      name={t("text.curvedLinks")}
                      checked={settings.curvedLinks}
                      onChange={(curvedLinks) => state.setGraphSettings({ curvedLinks })}
                    />
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
            </TabsContent>
            <TabsContent value="simulation" className="m-0 p-4 pt-0">
              {settings.layoutMode === "layered" && (
                <FieldDescription>{t("layout.forceSettings")}</FieldDescription>
              )}
              <FieldSet disabled={settings.layoutMode === "layered"}>
                <FieldGroup>
                  <FieldDescription>
                    {t("text.changesApplyWhenYouReleaseTheSliderIf")}
                  </FieldDescription>
                  <FieldSet>
                    <FieldLegend>{t("text.communityGrouping")}</FieldLegend>
                    <FieldGroup>
                      <SettingSwitch
                        id="community-enabled"
                        name={t("text.enableCommunityGrouping")}
                        checked={settings.communityEnabled}
                        onChange={(communityEnabled) =>
                          state.setGraphSettings({ communityEnabled })
                        }
                      />
                      <FieldDescription>
                        {t("text.groupNodesByTheirCurrentConnectionsAndBring")}
                      </FieldDescription>
                      {settings.communityEnabled && (
                        <>
                          {parameter(
                            "communityStrength",
                            t("text.communityAttraction"),
                            t("text.higherValuesBringGroupsCloserSetTo0"),
                          )}
                          {parameter(
                            "communityResolution",
                            t("text.communityResolution"),
                            t("text.higherValuesUsuallyProduceFinerGroupsChangesRecalculate"),
                          )}
                          <SettingSwitch
                            id="community-background"
                            name={t("text.showCommunityRegions2d")}
                            checked={settings.communityBackground}
                            disabled={settings.dimensions === 3}
                            onChange={(communityBackground) =>
                              state.setGraphSettings({ communityBackground })
                            }
                          />
                          <FieldDescription>
                            {t("text.regionsFollowNodeMovementAndAreShownOnly")}
                          </FieldDescription>
                        </>
                      )}
                    </FieldGroup>
                  </FieldSet>
                  {parameter(
                    "repulsion",
                    t("text.nodeRepulsion"),
                    t("text.higherValuesSpreadNodesFurtherApart"),
                  )}
                  {parameter("gravity", t("text.centerGravity"))}
                  {parameter("linkDistance", t("text.targetLinkDistance"))}
                  {parameter("linkSpring", t("text.linkStrength"))}
                  {parameter(
                    "friction",
                    t("text.motionInertia"),
                    t("text.higherValuesKeepNodesMovingLonger"),
                  )}
                  {parameter("collision", t("text.collisionStrength"))}
                  {parameter("collisionPadding", t("text.collisionSpacing"))}
                  {parameter(
                    "decay",
                    t("text.layoutCoolingSteps"),
                    t("text.measuredInSimulationStepsNotMillisecondsHigherValues"),
                  )}
                </FieldGroup>
              </FieldSet>
            </TabsContent>
            <TabsContent value="spatial" className="m-0 p-4 pt-0">
              <FieldGroup>
                <FieldDescription>{t("text.switchBetween2dAnd3dInTheToolbar")}</FieldDescription>
                {parameter("depthFade", t("text.fadeDistantNodes"))}
                <SettingSwitch
                  id="sphere-shading"
                  name={t("text.sphereLighting")}
                  checked={settings.sphereShading}
                  onChange={(sphereShading) => state.setGraphSettings({ sphereShading })}
                />
                <FieldDescription>
                  {t("text.shiftDragToMoveSelectedNodesTogetherIn")}
                </FieldDescription>
              </FieldGroup>
            </TabsContent>
          </ScrollArea>
        </Tabs>
        <SheetFooter>
          <Button variant="outline" onClick={state.resetAppearance}>
            <RotateCcw data-icon="inline-start" />
            {t("text.restoreDefaults")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
