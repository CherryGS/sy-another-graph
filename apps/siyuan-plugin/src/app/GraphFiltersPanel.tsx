import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkbenchState } from "./state";
import { DEFAULT_FILTERS } from "../data/types";
import { getNodeTypeCounts } from "../data/graph-summary";
import { isTypeHidden } from "../data/filter-types";
import { NODE_TYPE_LABELS } from "../data/labels";
import { SettingSwitch } from "./SettingsPanel";
import { MentionControls } from "./MentionControls";

const NATIVE_ID = /^\d{14}-[a-z0-9]{7}$/;

export function GraphFiltersPanel({
  state,
  onBack,
  footer,
}: {
  state: WorkbenchState;
  onBack: () => void;
  footer: ReactNode;
}) {
  const { filters, setFilters, data } = state;
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backRef.current?.focus();
  }, []);
  const [scopeDraft, setScopeDraft] = useState(filters.scopeId);
  const [excludeDraft, setExcludeDraft] = useState(
    filters.excludeIds.join("\n"),
  );
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Reflect native scope and filter-preset changes.
    setScopeDraft(filters.scopeId);
  }, [filters.scopeId]);
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Reflect restored exclusions.
    setExcludeDraft(filters.excludeIds.join("\n"));
  }, [filters.excludeIds]);
  const types = useMemo(() => {
    if (!data) return [];
    return [...getNodeTypeCounts(data.nodes)].sort(([a], [b]) =>
      a === "d" ? -1 : b === "d" ? 1 : a.localeCompare(b),
    );
  }, [data]);
  const scopeValid = !scopeDraft || NATIVE_ID.test(scopeDraft);
  const exclusionsValid = excludeDraft
    .split(/[\s,，;；]+/)
    .filter(Boolean)
    .every((id) => NATIVE_ID.test(id));
  return (
    <section className="filter-panel" aria-label="图谱筛选">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            ref={backRef}
            variant="ghost"
            size="icon-sm"
            aria-label="返回筛选预设"
            onClick={onBack}
          >
            <ArrowLeft />
          </Button>
          <h2 className="min-w-0 truncate font-medium" title={state.filterPresets.activeName}>
            编辑筛选：{state.filterPresets.activeName}
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          筛选自动生效，节点选择与邻域操作位于工具栏。
        </p>
      </div>
      <ScrollArea className="filter-scroll min-h-0" data-scroll-panel>
        <div className="px-4 pb-4">
          <FieldGroup>
            <Field data-invalid={!scopeValid}>
              <FieldLabel htmlFor="graph-scope">
                初始范围 · 文档或块 ID
              </FieldLabel>
              <Input
                id="graph-scope"
                placeholder="留空查看全部内容"
                value={scopeDraft}
                aria-invalid={!scopeValid}
                onChange={(event) => {
                  const scopeId = event.target.value.trim();
                  setScopeDraft(scopeId);
                  if (!scopeId || NATIVE_ID.test(scopeId))
                    setFilters((previous) => ({ ...previous, scopeId }));
                }}
              />
              <FieldDescription>
                多跳仅在初始范围内查找，不展示范围外节点；范围内背景保持可见。
              </FieldDescription>
              {!scopeValid && (
                <FieldError>请输入完整块 ID；当前范围保持原值。</FieldError>
              )}
            </Field>
            <SettingSwitch
              id="include-children"
              name="包含子文档"
              checked={filters.includeChildDocuments}
              onChange={(includeChildDocuments) =>
                setFilters((previous) => ({
                  ...previous,
                  includeChildDocuments,
                }))
              }
            />
            <Field data-invalid={!exclusionsValid}>
              <FieldLabel htmlFor="graph-exclusions">
                排除这些 ID 下的内容
              </FieldLabel>
              <Textarea
                id="graph-exclusions"
                rows={2}
                placeholder="每行一个文档或块 ID"
                value={excludeDraft}
                aria-invalid={!exclusionsValid}
                onChange={(event) => {
                  const value = event.target.value;
                  setExcludeDraft(value);
                  const ids = value.split(/[\s,，;；]+/).filter(Boolean);
                  if (ids.every((id) => NATIVE_ID.test(id)))
                    setFilters((previous) => ({
                      ...previous,
                      excludeIds: [...new Set(ids)],
                    }));
                }}
              />
              {!exclusionsValid && (
                <FieldError>包含不完整的 ID；原排除条件仍生效。</FieldError>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="notebook-filter">笔记本</FieldLabel>
              <Select
                value={filters.notebook || "all"}
                onValueChange={(value) =>
                  setFilters((previous) => ({
                    ...previous,
                    notebook: value === "all" ? "" : value,
                  }))
                }
              >
                <SelectTrigger id="notebook-filter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部笔记本</SelectItem>
                    {data?.notebooks.map((book) => (
                      <SelectItem key={book.id} value={book.id}>
                        {book.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <FieldSet>
              <FieldLegend>关系</FieldLegend>
              <FieldGroup>
                <SettingSwitch
                  id="reference-filter"
                  name="块引用 · 实线"
                  checked={filters.references}
                  onChange={(references) =>
                    setFilters((previous) => ({ ...previous, references }))
                  }
                />
                <SettingSwitch
                  id="hierarchy-filter"
                  name="包含关系 · 虚线"
                  checked={filters.hierarchy}
                  onChange={(hierarchy) =>
                    setFilters((previous) => ({ ...previous, hierarchy }))
                  }
                />
                <SettingSwitch
                  id="database-filter"
                  name="数据库关系"
                  checked={filters.databases}
                  onChange={(databases) =>
                    setFilters((previous) => ({ ...previous, databases }))
                  }
                />
                <FieldDescription>
                  每条启用的关系计 1 跳；关闭的关系不参与邻域扩展。
                </FieldDescription>
                <MentionControls state={state} />
                <SettingSwitch
                  id="isolated-filter"
                  name="隐藏未选中的孤立节点"
                  checked={filters.hideIsolated}
                  onChange={(hideIsolated) =>
                    setFilters((previous) => ({ ...previous, hideIsolated }))
                  }
                />
              </FieldGroup>
            </FieldSet>
            <FieldSet>
              <FieldLegend>节点类型</FieldLegend>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFilters((previous) => ({
                      ...previous,
                      documentsOnly: false,
                      hiddenTypes: [],
                    }))
                  }
                >
                  全部类型
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFilters((previous) => ({
                      ...previous,
                      documentsOnly: true,
                      hiddenTypes: [],
                    }))
                  }
                >
                  仅文档
                </Button>
              </div>
              <FieldGroup className="gap-3">
                {types.map(([type, count]) => (
                  <Field
                    key={type}
                    orientation="horizontal"
                    data-disabled={type === "d"}
                  >
                    <Checkbox
                      id={`type-${type}`}
                      aria-label={`显示${NODE_TYPE_LABELS[type] ?? type}`}
                      disabled={type === "d"}
                      checked={!isTypeHidden(filters, type)}
                      onCheckedChange={(checked) =>
                        setFilters((previous) => {
                          const hiddenTypes = previous.documentsOnly
                            ? types.map(([nodeType]) => nodeType).filter(
                                (nodeType) => nodeType !== "d",
                              )
                            : previous.hiddenTypes;
                          return {
                            ...previous,
                            documentsOnly: false,
                            hiddenTypes:
                              checked === true
                                ? hiddenTypes.filter((hidden) => hidden !== type)
                                : [...new Set([...hiddenTypes, type])],
                          };
                        })
                      }
                    />
                    <FieldLabel htmlFor={`type-${type}`}>
                      {NODE_TYPE_LABELS[type] ?? type}
                    </FieldLabel>
                    <Badge variant="secondary">{count.toLocaleString()}</Badge>
                  </Field>
                ))}
              </FieldGroup>
              <FieldDescription>
                隐藏块的引用归入所属文档；隐藏已选块会取消其选择与固定。
              </FieldDescription>
            </FieldSet>
          </FieldGroup>
        </div>
      </ScrollArea>
      <Separator />
      <div className="flex flex-col gap-2 p-3">
        {footer}
        <Button
          variant="outline"
          className="w-full"
          onClick={() =>
            setFilters({
              ...DEFAULT_FILTERS,
              excludeIds: [...DEFAULT_FILTERS.excludeIds],
              hiddenTypes: [...DEFAULT_FILTERS.hiddenTypes],
            })
          }
        >
          重置筛选
        </Button>
      </div>
    </section>
  );
}
