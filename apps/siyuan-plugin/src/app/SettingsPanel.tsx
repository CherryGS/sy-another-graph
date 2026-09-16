import { useEffect, useState } from "react";
import { RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { GRAPH_SETTING_RANGES } from "../graph/settings";
import type { GraphColorMode } from "../graph/node-colors";
import type { WorkbenchState } from "./state";

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
  return (
    <Field orientation="horizontal" data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{name}</FieldLabel>
      <Switch id={id} disabled={disabled} checked={checked} onCheckedChange={onChange} />
    </Field>
  );
}

export function SettingsPanel({ state }: { state: WorkbenchState }) {
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
        <Button variant="ghost" size="icon" aria-label="图谱设置" title="图谱设置">
          <Settings2 />
        </Button>
      </SheetTrigger>
      <SheetContent className="settings-sheet gap-0">
        <SheetHeader>
          <SheetTitle>图谱设置</SheetTitle>
          <SheetDescription>外观与布局偏好自动保存在当前浏览器。</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="appearance" className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="mx-4 mb-4">
            <TabsTrigger value="appearance">显示</TabsTrigger>
            <TabsTrigger value="simulation">力导向</TabsTrigger>
            <TabsTrigger value="spatial">三维</TabsTrigger>
          </TabsList>
          <ScrollArea className="min-h-0 flex-1" data-scroll-panel>
            <TabsContent value="appearance" className="m-0 p-4 pt-0">
              <FieldGroup>
                <FieldSet>
                  <FieldLegend>节点</FieldLegend>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="node-colors">节点颜色</FieldLabel>
                      <Select
                        value={state.colorBy}
                        onValueChange={(value) => state.setColorBy(value as GraphColorMode)}
                      >
                        <SelectTrigger id="node-colors" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="type">按节点类型</SelectItem>
                            <SelectItem value="branch">按文档分支</SelectItem>
                            <SelectItem value="notebook">按笔记本</SelectItem>
                            <SelectItem value="degree">按连接度</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <SettingSlider
                      name="节点大小"
                      value={state.pointSize}
                      range={{ min: 1, max: 10, step: 0.5 }}
                      onCommit={state.setPointSize}
                    />
                    <SettingSwitch
                      id="show-labels"
                      name="显示标签"
                      checked={state.showLabels}
                      onChange={state.setShowLabels}
                    />
                    <Field data-disabled={!state.showLabels}>
                      <FieldLabel id="label-density-label">标签密度</FieldLabel>
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
                          标准
                        </ToggleGroupItem>
                        <ToggleGroupItem value="dense" className="flex-1">
                          较密
                        </ToggleGroupItem>
                        <ToggleGroupItem value="high" className="flex-1">
                          密集
                        </ToggleGroupItem>
                      </ToggleGroup>
                      <FieldDescription id="label-density-description">
                        提高密度可显示更多标签，重叠时仍会自动避让。
                      </FieldDescription>
                    </Field>
                    <SettingSwitch
                      id="scale-points"
                      name="节点随缩放改变大小"
                      checked={settings.scalePointsOnZoom}
                      onChange={(scalePointsOnZoom) =>
                        state.setGraphSettings({ scalePointsOnZoom })
                      }
                    />
                  </FieldGroup>
                </FieldSet>
                <FieldSet>
                  <FieldLegend>连线</FieldLegend>
                  <FieldGroup>
                    <SettingSwitch
                      id="show-links"
                      name="显示连线"
                      checked={state.showLinks}
                      onChange={state.setShowLinks}
                    />
                    {parameter("linkWidth", "连线粗细")}
                    {parameter("linkOpacity", "连线不透明度")}
                    <SettingSwitch
                      id="show-arrows"
                      name="显示方向箭头"
                      checked={settings.showArrows}
                      onChange={(showArrows) => state.setGraphSettings({ showArrows })}
                    />
                    <SettingSwitch
                      id="curved-links"
                      name="曲线连线"
                      checked={settings.curvedLinks}
                      onChange={(curvedLinks) => state.setGraphSettings({ curvedLinks })}
                    />
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
            </TabsContent>
            <TabsContent value="simulation" className="m-0 p-4 pt-0">
              <FieldGroup>
                <FieldDescription>
                  滑块松开后应用。布局暂停时，可点击画布右下角继续布局查看效果。
                </FieldDescription>
                <FieldSet>
                  <FieldLegend>社区聚合</FieldLegend>
                  <FieldGroup>
                    <SettingSwitch
                      id="community-enabled"
                      name="启用社区聚合"
                      checked={settings.communityEnabled}
                      onChange={(communityEnabled) => state.setGraphSettings({ communityEnabled })}
                    />
                    <FieldDescription>
                      按当前图的连接分组，让同组节点更靠近。节点颜色沿用现有设置。
                    </FieldDescription>
                    {settings.communityEnabled && (
                      <>
                        {parameter(
                          "communityStrength",
                          "社区聚拢力度",
                          "越大越紧密；设为 0 可保留分组而关闭聚拢力。",
                        )}
                        {parameter(
                          "communityResolution",
                          "社区划分粒度",
                          "越大通常分得越细；修改后重新计算社区。",
                        )}
                        <SettingSwitch
                          id="community-background"
                          name="显示社区区域背景（2D）"
                          checked={settings.communityBackground}
                          disabled={settings.dimensions === 3}
                          onChange={(communityBackground) =>
                            state.setGraphSettings({ communityBackground })
                          }
                        />
                        <FieldDescription>区域背景随节点移动更新，仅在二维显示。</FieldDescription>
                      </>
                    )}
                  </FieldGroup>
                </FieldSet>
                {parameter("repulsion", "节点斥力", "提高后，节点之间更分散。")}
                {parameter("gravity", "中心引力")}
                {parameter("linkDistance", "连线目标距离")}
                {parameter("linkSpring", "连线弹力")}
                {parameter("friction", "运动惯性", "数值越大，节点越不容易停下。")}
                {parameter("collision", "碰撞强度")}
                {parameter("collisionPadding", "碰撞间距")}
                {parameter(
                  "decay",
                  "布局冷却步数",
                  "按模拟步数计，不是毫秒；数值越大，布局冷却越慢。",
                )}
              </FieldGroup>
            </TabsContent>
            <TabsContent value="spatial" className="m-0 p-4 pt-0">
              <FieldGroup>
                <FieldDescription>
                  在工具栏切换 2D / 3D。三维模式下拖动空白旋转，Space 拖动平移，滚轮缩放。
                </FieldDescription>
                {parameter("depthFade", "远处节点淡化")}
                <SettingSwitch
                  id="sphere-shading"
                  name="球体光照"
                  checked={settings.sphereShading}
                  onChange={(sphereShading) => state.setGraphSettings({ sphereShading })}
                />
                <FieldDescription>
                  Shift 拖动所选节点，会在当前视角下整体移动并保持彼此位置。
                </FieldDescription>
              </FieldGroup>
            </TabsContent>
          </ScrollArea>
        </Tabs>
        <SheetFooter>
          <Button variant="outline" onClick={state.resetAppearance}>
            <RotateCcw data-icon="inline-start" />
            恢复默认设置
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
