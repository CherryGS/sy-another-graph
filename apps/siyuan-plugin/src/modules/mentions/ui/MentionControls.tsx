import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { Progress } from "@/shared/ui/progress";
import { Button } from "@/shared/ui/button";
import { isMentionMode } from "../types";
import type { MentionControlsProps } from "./types";
import { MentionExclusions } from "./MentionExclusions";

export function MentionControls({
  mode,
  phrases,
  chosenCount,
  status,
  editorKey,
  onModeChange,
  onPhrasesChange,
}: MentionControlsProps) {
  const { progress, ready, error, pending } = status;
  return (
    <FieldGroup className="gap-3">
      <Field>
        <FieldLabel>文本提及 · 点线</FieldLabel>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          aria-label="文本提及模式"
          value={mode}
          className="w-full"
          onValueChange={(value) => {
            if (isMentionMode(value)) onModeChange(value);
          }}
        >
          <ToggleGroupItem value="off" className="flex-1">
            关闭
          </ToggleGroupItem>
          <ToggleGroupItem value="selected" className="flex-1">
            已选节点
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="flex-1">
            范围内全部
          </ToggleGroupItem>
        </ToggleGroup>
        <FieldDescription>
          按文档标题、命名或别名匹配正文，保留原文依据。已选模式包含所选文档正文和所选块的入向、出向提及；启用后每条关系计
          1 跳。
        </FieldDescription>
        {error ? (
          <>
            <FieldDescription>{error}</FieldDescription>
            <Button variant="outline" size="sm" onClick={status.retry}>
              重试文本提及
            </Button>
          </>
        ) : !ready ? (
          <>
            <Progress
              aria-label="文本提及索引进度"
              value={progress.total ? (progress.scanned / progress.total) * 100 : 0}
            />
            <FieldDescription>
              后台索引 {progress.scanned.toLocaleString()} / {progress.total.toLocaleString()}{" "}
              个正文块；完成后显示匹配结果。
            </FieldDescription>
          </>
        ) : (
          <FieldDescription>
            {progress.keywords.toLocaleString()} 个名称已就绪 · 复用{" "}
            {progress.cached.toLocaleString()} 个正文块缓存
            {pending && " · 更新关系中"}
          </FieldDescription>
        )}
        {mode === "selected" && !chosenCount && (
          <FieldDescription>选择节点后显示相关提及，Shift 点击可以多选。</FieldDescription>
        )}
      </Field>
      <MentionExclusions key={editorKey} phrases={phrases} onApply={onPhrasesChange} />
    </FieldGroup>
  );
}
