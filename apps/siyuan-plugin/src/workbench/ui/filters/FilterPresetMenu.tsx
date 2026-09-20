import { useLocale } from "../../../shared/i18n/react";
import { t } from "../../../shared/i18n/runtime";
import { useRef, useState, type FormEvent, type Ref, type RefObject } from "react";
import { cn } from "@/shared/lib/utils";
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
import { Alert, AlertAction, AlertDescription } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { PopoverContent } from "@/shared/ui/popover";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Separator } from "@/shared/ui/separator";
import { Spinner } from "@/shared/ui/spinner";
import { Sheet, SheetContent } from "@/shared/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import type { FilterPreset } from "../../../modules/presets/model";
import { GraphFiltersPanel } from "./GraphFiltersPanel";
import type { WorkbenchState } from "../../model/state";

type NamingAction =
  { kind: "create" | "saveAs" } | { kind: "copy" | "rename"; preset: FilterPreset };

const NAMING_TITLES = {
  get create() {
    return t("text.newFilterPreset");
  },
  get copy() {
    return t("text.copyFilterPreset");
  },
  get rename() {
    return t("text.renameFilterPreset");
  },
  get saveAs() {
    return t("text.saveCurrentFiltersAsAPreset");
  },
};

export function FilterPresetMenu({
  state,
  editorHost,
}: {
  state: WorkbenchState;
  editorHost: RefObject<HTMLElement | null>;
}) {
  useLocale();
  const presets = state.filterPresets;
  const [details, setDetails] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [naming, setNaming] = useState<NamingAction | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const editRequest = useRef(0);
  const editorOpen = useRef(false);
  const namingTrigger = useRef<HTMLElement | null>(null);
  const busy = presets.loading || presets.saving;
  const disabled = busy || !presets.available;
  const full = presets.presets.length >= 50;

  function openEditor() {
    editorOpen.current = true;
    setCollapsed(false);
    setDetails(true);
    state.setFiltersOpen(false);
  }

  function startNaming(action: NamingAction) {
    namingTrigger.current = document.activeElement as HTMLElement | null;
    setNaming(action);
    state.setFiltersOpen(false);
  }

  function finishNaming() {
    setNaming(null);
    if (!editorOpen.current) state.setFiltersOpen(true);
  }

  function restoreNamingFocus() {
    if (!editorOpen.current) return;
    if (namingTrigger.current?.isConnected) namingTrigger.current.focus();
    else document.querySelector<HTMLButtonElement>("[data-filter-editor-back]")?.focus();
  }

  async function editPreset(preset: FilterPreset) {
    const request = ++editRequest.current;
    // Reopening the current preset must retain its unsaved filter changes.
    const editable = preset.id === presets.activeId || (await presets.apply(preset.id));
    if (editable && request === editRequest.current) openEditor();
  }

  const saveActions = !presets.temporaryActive && (presets.modified || !presets.activeId) && (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {presets.activeId && (
          <Button
            size="sm"
            className="flex-1"
            disabled={disabled}
            onClick={() => void presets.update()}
          >
            {t("text.updatePreset")}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={disabled || full}
          onClick={() => startNaming({ kind: "saveAs" })}
        >
          {t("text.saveAsPreset")}
        </Button>
      </div>
    </div>
  );

  const feedback = (
    <>
      {presets.temporaryActive && presets.temporary && (
        <Alert role="status">
          <AlertDescription className="flex flex-col gap-2">
            <p>
              {t("search.scopeDescription", {
                matches: presets.temporary.ids.size,
                ancestors: presets.searchAncestorCount,
              })}
            </p>
            <p className="break-words">
              {t("text.searchValue", { p0: presets.temporary.snapshot.label })}
            </p>
            {presets.missingSearchIds.length > 0 && (
              <p>
                {t("search.missingMatches", {
                  count: presets.missingSearchIds.length,
                  examples: presets.missingSearchIds.slice(0, 5).join(", "),
                })}
              </p>
            )}
            <Button variant="outline" size="sm" onClick={presets.leaveSearch}>
              {t("text.returnToPreviousConfiguration")}
            </Button>
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
              {t("text.reloadPresets")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {presets.deleted && (
        <Alert role="status">
          <AlertDescription className="truncate">
            {t("preset.deleted", { name: presets.deleted.name })}
          </AlertDescription>
          <AlertAction>
            <Button
              variant="ghost"
              size="xs"
              disabled={disabled || full}
              onClick={() => void presets.undoDelete()}
            >
              <Undo2 data-icon="inline-start" />
              {t("text.undo")}
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
        aria-label={t("text.filterPresets")}
        onCloseAutoFocus={(event) => {
          if (naming || editorOpen.current) event.preventDefault();
          else editRequest.current++;
        }}
      >
        <ScrollArea className="filter-preset-scroll" data-scroll-panel>
          <div className="flex flex-col gap-2 p-2">
            <Button
              variant="ghost"
              className="w-full justify-start"
              disabled={disabled || full}
              onClick={() => startNaming({ kind: "create" })}
            >
              <Plus data-icon="inline-start" />
              {t("text.newPreset")}
            </Button>
            <Separator />
            {presets.loading ? (
              <div className="flex items-center gap-2 p-2" role="status">
                <Spinner />
                {t("text.loadingPresets")}
              </div>
            ) : (
              <ul className="flex flex-col gap-1" aria-label={t("text.filterPresetList")}>
                {presets.temporary && (
                  <li className="flex min-w-0 items-center gap-1">
                    <Button
                      variant={presets.temporaryActive ? "secondary" : "ghost"}
                      className="min-w-0 flex-1 justify-start"
                      aria-pressed={presets.temporaryActive}
                      title={presets.temporary.snapshot.label}
                      onClick={() => {
                        presets.resumeSearch();
                        state.setFiltersOpen(false);
                      }}
                    >
                      {presets.temporaryActive && <Check data-icon="inline-start" />}
                      <span className="truncate">
                        {t("text.search")}
                        {presets.temporary.snapshot.label}
                      </span>
                      <Badge variant="outline">{t("text.temporary")}</Badge>
                    </Button>
                    <PresetAction
                      label={t("text.editTemporarySearchFilters")}
                      hint={t("text.editFilters")}
                      icon={SlidersHorizontal}
                      disabled={false}
                      onClick={() => {
                        if (!presets.temporaryActive) presets.resumeSearch();
                        openEditor();
                      }}
                    />
                  </li>
                )}
                {!presets.activeId && !presets.temporaryActive && (
                  <li className="flex min-w-0 items-center gap-1">
                    <Button
                      variant="secondary"
                      className="min-w-0 flex-1 justify-start"
                      aria-label={t("text.currentFilterCustom")}
                      aria-pressed
                      onClick={() => state.setFiltersOpen(false)}
                    >
                      <Check data-icon="inline-start" />
                      <span className="truncate">{t("text.custom")}</span>
                    </Button>
                    <PresetAction
                      buttonRef={editButtonRef}
                      label={t("text.editFilterCustom")}
                      hint={t("text.editFilters")}
                      icon={SlidersHorizontal}
                      disabled={false}
                      onClick={openEditor}
                    />
                  </li>
                )}
                {presets.presets.map((preset) => (
                  <li key={preset.id} className="flex min-w-0 items-center gap-1">
                    <Button
                      variant={preset.id === presets.activeId ? "secondary" : "ghost"}
                      className="min-w-0 flex-1 justify-start"
                      disabled={disabled}
                      aria-label={t("text.applyPresetValue", { p0: preset.name })}
                      aria-pressed={preset.id === presets.activeId}
                      title={preset.name}
                      onClick={() => {
                        void presets.apply(preset.id).then((applied) => {
                          if (applied) state.setFiltersOpen(false);
                        });
                      }}
                    >
                      {preset.id === presets.activeId && <Check data-icon="inline-start" />}
                      <span className="truncate">{preset.name}</span>
                    </Button>
                    <PresetAction
                      buttonRef={preset.id === presets.activeId ? editButtonRef : undefined}
                      label={t("text.editFilterValue", { p0: preset.name })}
                      hint={t("text.editFilters")}
                      icon={SlidersHorizontal}
                      disabled={preset.id !== presets.activeId && disabled}
                      onClick={() => void editPreset(preset)}
                    />
                    <PresetAction
                      label={t("text.copyPresetValue", { p0: preset.name })}
                      hint={t("text.copy")}
                      icon={Copy}
                      disabled={disabled || full}
                      onClick={() => startNaming({ kind: "copy", preset })}
                    />
                    <PresetAction
                      label={t("text.renamePresetValue", { p0: preset.name })}
                      hint={t("text.rename")}
                      icon={Pencil}
                      disabled={disabled}
                      onClick={() => startNaming({ kind: "rename", preset })}
                    />
                    <PresetAction
                      label={t("text.deletePresetValue", { p0: preset.name })}
                      hint={t("text.delete")}
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
                {t("text.youCanSaveUpTo50Presets")}
              </p>
            )}
            {(saveActions || presets.error || presets.deleted) && <Separator />}
            {saveActions && <div className="p-2">{saveActions}</div>}
            {feedback}
          </div>
        </ScrollArea>
      </PopoverContent>
      <Sheet
        modal={false}
        open={details}
        onOpenChange={(open) => {
          editorOpen.current = open;
          setDetails(open);
        }}
      >
        <SheetContent
          side="left"
          container={editorHost.current}
          showCloseButton={false}
          className={cn(
            "absolute gap-0 data-[side=left]:sm:max-w-none",
            collapsed ? "data-[side=left]:w-11" : "data-[side=left]:w-[min(360px,100%)]",
          )}
          onInteractOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!state.filtersOpen && !naming)
              document.querySelector<HTMLButtonElement>("[data-filter-presets-trigger]")?.focus();
          }}
        >
          <GraphFiltersPanel
            state={state}
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
            onBack={() => {
              editorOpen.current = false;
              setDetails(false);
              state.setFiltersOpen(true);
              requestAnimationFrame(() => editButtonRef.current?.focus());
            }}
            footer={
              <>
                {saveActions}
                {feedback}
              </>
            }
          />
        </SheetContent>
      </Sheet>
      {naming && (
        <PresetNameDialog
          action={naming}
          presets={presets}
          onClose={finishNaming}
          onRestoreFocus={restoreNamingFocus}
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
  useLocale();
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
  onRestoreFocus,
}: {
  action: NamingAction;
  presets: WorkbenchState["filterPresets"];
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(() => {
    if (action.kind === "rename") return action.preset.name;
    if (action.kind === "copy") return t("text.valueCopy", { p0: action.preset.name.slice(0, 77) });
    if (action.kind === "saveAs")
      return t("text.valueCopy", { p0: presets.activeName.slice(0, 77) });
    return t("text.newPreset2");
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
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
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
              ? t("text.startWithDocumentsOnlyWithContainmentAndText")
              : action.kind === "copy"
                ? t("text.copyTheFiltersSavedInThisPreset")
                : action.kind === "rename"
                  ? t("text.giveThePresetARecognizableName")
                  : t("text.saveTheCurrentFiltersToSwitchBackTo")}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field data-invalid={invalid} data-disabled={busy}>
              <FieldLabel htmlFor="filter-preset-name">{t("text.presetName")}</FieldLabel>
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
              {invalid && <FieldError>{t("text.enterAPresetName")}</FieldError>}
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
                    {t("text.reloadPresets")}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {t("text.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !presets.available}>
              {presets.saving && <Spinner data-icon="inline-start" />}
              {t("text.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
