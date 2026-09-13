import { useRef, useState, type FormEvent, type Ref } from "react";
import {
  Check,
  Copy,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FilterPreset } from "../presets/model";
import { GraphFiltersPanel } from "./GraphFiltersPanel";
import type { WorkbenchState } from "./state";

type NamingAction =
  | { kind: "create" | "saveAs" }
  | { kind: "copy" | "rename"; preset: FilterPreset };

const NAMING_TITLES = {
  create: "新增筛选预设",
  copy: "复制筛选预设",
  rename: "重命名筛选预设",
  saveAs: "将当前筛选另存为预设",
};

export function FilterPresetMenu({ state }: { state: WorkbenchState }) {
  const presets = state.filterPresets;
  const [details, setDetails] = useState(false);
  const [naming, setNaming] = useState<NamingAction | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const editRequest = useRef(0);
  const busy = presets.loading || presets.saving;
  const disabled = busy || !presets.available;
  const full = presets.presets.length >= 50;

  function startNaming(action: NamingAction) {
    setNaming(action);
    state.setFiltersOpen(false);
  }

  function finishNaming() {
    setNaming(null);
    state.setFiltersOpen(true);
  }

  async function editPreset(preset: FilterPreset) {
    const request = ++editRequest.current;
    // Reopening the current preset must retain its unsaved filter changes.
    const editable = preset.id === presets.activeId || await presets.apply(preset.id);
    if (editable && request === editRequest.current) setDetails(true);
  }

  const saveActions = !presets.temporaryActive && (presets.modified || !presets.activeId) && (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-xs text-muted-foreground">
          当前：{presets.activeName}
        </span>
        {presets.modified && <Badge variant="secondary">已修改</Badge>}
      </div>
      <div className="flex gap-2">
        {presets.activeId && (
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => void presets.update()}
          >
            更新预设
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || full}
          onClick={() => startNaming({ kind: "saveAs" })}
        >
          另存为预设
        </Button>
      </div>
    </div>
  );

  const feedback = (
    <>
      {presets.temporaryActive && presets.temporary && (
        <Alert role="status">
          <AlertDescription className="flex flex-col gap-2">
            <p>临时搜索范围：{presets.temporary.ids.size.toLocaleString()} 个命中 + {presets.searchAncestorCount.toLocaleString()} 个上级节点。沿包含关系上溯至顶层文档。筛选只影响此临时图；返回后恢复原来的配置和未保存修改。</p>
            <p className="break-words">搜索：{presets.temporary.snapshot.label}</p>
            {presets.missingSearchIds.length > 0 && (
              <p>当前图谱数据缺少 {presets.missingSearchIds.length.toLocaleString()} 个命中块，图谱不完整。请重新读取数据；已删除、加密或未能读取的块无法显示。缺失 ID 示例：{presets.missingSearchIds.slice(0, 5).join("、")}</p>
            )}
            <Button variant="outline" size="sm" onClick={presets.leaveSearch}>返回原配置</Button>
          </AlertDescription>
        </Alert>
      )}
      {presets.error && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col gap-2">
            <p>{presets.error}</p>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={busy}
              onClick={presets.retry}
            >
              重新读取预设
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {presets.deleted && (
        <Alert role="status">
          <AlertDescription className="truncate">
            已删除「{presets.deleted.name}」
          </AlertDescription>
          <AlertAction>
            <Button
              variant="ghost"
              size="xs"
              disabled={disabled || full}
              onClick={() => void presets.undoDelete()}
            >
              <Undo2 data-icon="inline-start" />
              撤销
            </Button>
          </AlertAction>
        </Alert>
      )}
    </>
  );

  return (
    <>
      <PopoverContent
        align="start"
        className="filter-popover gap-0 p-0"
        aria-label={details ? `编辑筛选：${presets.activeName}` : "筛选预设"}
        onCloseAutoFocus={(event) => {
          if (naming) event.preventDefault();
          else { editRequest.current++; setDetails(false); }
        }}
      >
        {details ? (
          <GraphFiltersPanel
            state={state}
            onBack={() => {
              setDetails(false);
              requestAnimationFrame(() => editButtonRef.current?.focus());
            }}
            footer={
              <>
                {saveActions}
                {feedback}
              </>
            }
          />
        ) : (
          <ScrollArea className="filter-preset-scroll" data-scroll-panel>
            <div className="flex flex-col gap-2 p-2">
              <Button
                variant="ghost"
                className="w-full justify-start"
                disabled={disabled || full}
                onClick={() => startNaming({ kind: "create" })}
              >
                <Plus data-icon="inline-start" />
                新增预设
              </Button>
              <Separator />
              {presets.loading ? (
                <div className="flex items-center gap-2 p-2" role="status">
                  <Spinner />
                  正在读取预设
                </div>
              ) : (
                <ul className="flex flex-col gap-1" aria-label="筛选预设列表">
                  {presets.temporary && (
                    <li className="flex min-w-0 items-center gap-1">
                      <Button
                        variant={presets.temporaryActive ? "secondary" : "ghost"}
                        className="min-w-0 flex-1 justify-start"
                        aria-pressed={presets.temporaryActive}
                        title={presets.temporary.snapshot.label}
                        onClick={() => { presets.resumeSearch(); state.setFiltersOpen(false); }}
                      >
                        {presets.temporaryActive && <Check data-icon="inline-start" />}
                        <span className="truncate">搜索：{presets.temporary.snapshot.label}</span>
                        <Badge variant="outline">临时</Badge>
                      </Button>
                      <PresetAction
                        label="编辑临时搜索筛选" hint="编辑筛选" icon={SlidersHorizontal} disabled={false}
                        onClick={() => { if (!presets.temporaryActive) presets.resumeSearch(); setDetails(true); }}
                      />
                    </li>
                  )}
                  {!presets.activeId && !presets.temporaryActive && (
                    <li className="flex min-w-0 items-center gap-1">
                      <Button
                        variant="secondary"
                        className="min-w-0 flex-1 justify-start"
                        aria-label="当前筛选：自定义"
                        aria-pressed
                        onClick={() => state.setFiltersOpen(false)}
                      >
                        <Check data-icon="inline-start" />
                        <span className="truncate">自定义</span>
                      </Button>
                      <PresetAction
                        buttonRef={editButtonRef}
                        label="编辑筛选：自定义"
                        hint="编辑筛选"
                        icon={SlidersHorizontal}
                        disabled={false}
                        onClick={() => setDetails(true)}
                      />
                    </li>
                  )}
                  {presets.presets.map((preset) => (
                    <li key={preset.id} className="flex min-w-0 items-center gap-1">
                      <Button
                        variant={
                          preset.id === presets.activeId ? "secondary" : "ghost"
                        }
                        className="min-w-0 flex-1 justify-start"
                        disabled={disabled}
                        aria-label={`应用预设：${preset.name}`}
                        aria-pressed={preset.id === presets.activeId}
                        title={preset.name}
                        onClick={() => {
                          void presets.apply(preset.id).then((applied) => {
                            if (applied) state.setFiltersOpen(false);
                          });
                        }}
                      >
                        {preset.id === presets.activeId && (
                          <Check data-icon="inline-start" />
                        )}
                        <span className="truncate">{preset.name}</span>
                      </Button>
                      <PresetAction
                        buttonRef={preset.id === presets.activeId ? editButtonRef : undefined}
                        label={`编辑筛选：${preset.name}`}
                        hint="编辑筛选"
                        icon={SlidersHorizontal}
                        disabled={preset.id !== presets.activeId && disabled}
                        onClick={() => void editPreset(preset)}
                      />
                      <PresetAction
                        label={`复制预设：${preset.name}`}
                        hint="复制"
                        icon={Copy}
                        disabled={disabled || full}
                        onClick={() => startNaming({ kind: "copy", preset })}
                      />
                      <PresetAction
                        label={`重命名预设：${preset.name}`}
                        hint="重命名"
                        icon={Pencil}
                        disabled={disabled}
                        onClick={() => startNaming({ kind: "rename", preset })}
                      />
                      <PresetAction
                        label={`删除预设：${preset.name}`}
                        hint="删除"
                        icon={Trash2}
                        disabled={disabled}
                        onClick={() => void presets.remove(preset.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {full && (
                <p className="px-2 text-xs text-muted-foreground">
                  最多保存 50 个预设。
                </p>
              )}
              {(saveActions || presets.error || presets.deleted) && <Separator />}
              {saveActions && <div className="p-2">{saveActions}</div>}
              {feedback}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
      {naming && (
        <PresetNameDialog
          action={naming}
          presets={presets}
          onClose={finishNaming}
        />
      )}
    </>
  );
}

function PresetAction({
  buttonRef,
  label,
  hint,
  icon: Icon,
  disabled,
  onClick,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  label: string;
  hint: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={buttonRef}
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

function PresetNameDialog({
  action,
  presets,
  onClose,
}: {
  action: NamingAction;
  presets: WorkbenchState["filterPresets"];
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(() => {
    if (action.kind === "rename") return action.preset.name;
    if (action.kind === "copy") return `${action.preset.name.slice(0, 77)} 副本`;
    if (action.kind === "saveAs") return `${presets.activeName.slice(0, 77)} 副本`;
    return "新预设";
  });
  const [attempted, setAttempted] = useState(false);
  const busy = presets.loading || presets.saving;
  const invalid = attempted && !name.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !presets.available) return;
    setAttempted(true);
    if (!name.trim()) return;
    const saved =
      action.kind === "create"
        ? await presets.create(name)
        : action.kind === "copy"
          ? await presets.copy(action.preset.id, name)
          : action.kind === "rename"
            ? await presets.rename(action.preset.id, name)
            : await presets.saveAs(name);
    if (saved) onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{NAMING_TITLES[action.kind]}</DialogTitle>
          <DialogDescription>
            {action.kind === "create"
              ? "从仅文档、关闭包含关系和文本提及的配置开始。"
              : action.kind === "copy"
                ? "复制此预设保存的筛选配置。"
                : action.kind === "rename"
                  ? "为预设设置一个易于辨认的名称。"
                  : "保存当前筛选，之后可从菜单快速切换。"}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => void submit(event)}
        >
          <FieldGroup>
            <Field data-invalid={invalid} data-disabled={busy}>
              <FieldLabel htmlFor="filter-preset-name">预设名称</FieldLabel>
              <Input
                id="filter-preset-name"
                ref={inputRef}
                value={name}
                maxLength={80}
                aria-invalid={invalid}
                disabled={busy}
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
              />
              {invalid && <FieldError>请输入预设名称。</FieldError>}
            </Field>
          </FieldGroup>
          {attempted && presets.error && (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-col gap-2">
                <p>{presets.error}</p>
                {!presets.available && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    disabled={busy}
                    onClick={presets.retry}
                  >
                    重新读取预设
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy || !presets.available}>
              {presets.saving && <Spinner data-icon="inline-start" />}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
