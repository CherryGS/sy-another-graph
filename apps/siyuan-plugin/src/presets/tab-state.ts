import type { GraphDataset, GraphFilters } from "../data/types";
import { getGraphLookups } from "../data/graph-lookups";
import { NODE_TYPE_LABELS } from "../data/labels";

const clean = (value: string) => Array.from(value, character => {
  const code = character.charCodeAt(0);
  return code < 32 || (code >= 127 && code <= 159) ? " " : character;
}).join("").replace(/\s+/g, " ").trim();
const short = (value: string, length: number) => {
  const text = clean(value);
  if (text.length <= length) return text;
  let clipped = "";
  for (const character of text) {
    if (clipped.length + character.length >= length) break;
    clipped += character;
  }
  return clipped + "…";
};

/** A semantic summary of filter rules; transient selection and runtime counts
 * never determine the native tab title. */
export function graphTabState(filters: GraphFilters, data: GraphDataset | null, name: string, modified: boolean, searchScope?: string) {
  const source = data ? getGraphLookups(data).byId : null;
  const notebook = filters.notebook ? data?.notebooks.find(book => book.id === filters.notebook)?.name ?? "指定笔记本" : "全部";
  const scope = searchScope ?? (filters.scopeId ? source?.get(filters.scopeId)?.label || "指定范围" : notebook);
  const preset = clean(name) || "自定义";
  const title = `图谱 · ${short(scope, 28)} · ${short(preset, 28)}${modified ? "*" : ""}`;
  const relations = [filters.references && "引用", filters.hierarchy && "包含关系", filters.databases && "数据库关系"].filter(Boolean);
  const types = filters.documentsOnly ? "仅文档" : filters.hiddenTypes.length
    ? `自定义（隐藏：${filters.hiddenTypes.map(type => NODE_TYPE_LABELS[type] ?? type).join("、")}）` : "全部类型";
  const description = clean([
    `图谱范围：${scope}${filters.scopeId ? `（${filters.scopeId}）` : ""}`,
    `笔记本：${notebook}`,
    `预设：${preset}${modified ? "（已修改，尚未更新预设）" : ""}`,
    `类型：${types}`,
    `关系：${relations.join("、") || "关闭"}`,
    `文本提及：${filters.mentions === "off" ? "关闭" : filters.mentions === "selected" ? "已选节点" : "范围内全部"}`,
    `子文档：${filters.includeChildDocuments ? "包含" : "不包含"}`,
    `排除：${filters.excludeIds.length} 项`,
    `孤立节点：${filters.hideIsolated ? "隐藏未选中的节点" : "显示"}`,
  ].join("；"));
  return { title, description: short(description, 900) };
}
