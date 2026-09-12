export type ReadIssueCode = "snapshot-changed" | "reference-endpoints" | "database-identifier" |
  "database-read" | "database-budget" | "database-bindings" | "database-relations";

export interface ReadIssueDetail {
  fields: Record<string, string>;
  openBlockId?: string;
  openLabel?: string;
}

export interface ReadIssue {
  code: ReadIssueCode;
  title: string;
  summary: string;
  impact: string;
  suggestion: string;
  count: number;
  detailCount: number;
  details: ReadIssueDetail[];
}

const definitions: Record<ReadIssueCode, {
  title: string; summary: (count: number) => string; impact: string; suggestion: string;
}> = {
  "snapshot-changed": {
    title: "读取期间数据变化",
    summary: () => "读取期间块或引用发生变化，当前分页结果可能不完整。",
    impact: "这次读取不是原子快照，部分新建或删除的内容可能尚未反映在图中。",
    suggestion: "等待编辑、同步或索引结束后，重新读取图谱。",
  },
  "reference-endpoints": {
    title: "引用端点缺失",
    summary: n => `已省略 ${n.toLocaleString()} 条端点不可用的引用。`,
    impact: "这些引用没有加入图谱。这里的缺失指本次工作空间块索引中找不到端点，与图谱显示筛选不同。",
    suggestion: "打开可用来源检查引用目标；确认目标是否已删除、所在笔记本是否打开，或索引是否尚未更新。详情只记录实际读取结果，不推断删除原因。",
  },
  "database-identifier": {
    title: "数据库载体无法识别",
    summary: n => `无法识别 ${n.toLocaleString()} 个数据库块的逻辑库标识。`,
    impact: "这些载体仍保留在图中，但无法从它们读取数据库条目与字段关联。",
    suggestion: "打开来源确认数据库载体能否正常显示，检查其 data-av-id；不要把载体块 ID 当作数据库 ID。",
  },
  "database-read": {
    title: "数据库未能完整读取",
    summary: n => `${n.toLocaleString()} 个数据库未能完整读取。`,
    impact: "失败数据库的逻辑库、条目和相关连接未加入本次图谱；其他成功读取的数据库仍然可用。",
    suggestion: "查看具体接口错误或首个校验失败的位置、实际值和期望格式。可打开数据库来源核实，重新读取或复制报告用于排查。",
  },
  "database-budget": {
    title: "数据库读取达到上限",
    summary: () => "数据库读取达到上限，当前数据库关系不完整。",
    impact: "超出预算的数据库或关系未加入图谱；已完成的部分被保留。",
    suggestion: "查看触发的具体上限。图谱显示筛选不会缩小源数据读取量。",
  },
  "database-bindings": {
    title: "数据库条目绑定块缺失",
    summary: n => `${n.toLocaleString()} 个数据库条目的绑定块不在当前读取范围内。`,
    impact: "真实条目和库内成员关系已保留，仅省略不可用的绑定连接。缺失指本次工作空间块索引，而非显示筛选。",
    suggestion: "从数据库来源检查该条目绑定的块，确认它是否仍存在以及所在笔记本是否打开。",
  },
  "database-relations": {
    title: "数据库关联端点缺失",
    summary: n => `${n.toLocaleString()} 条数据库字段关联的实际条目端点不可用。`,
    impact: "这些字段关联未加入图谱；不会根据显示文字虚构缺失条目。",
    suggestion: "检查关联字段中的源、目标条目，以及目标数据库是否出现在其他读取失败提示中。",
  },
};

/** Keep exact totals while bounding diagnostic memory and modal/report size. */
export class ReadIssueCollector {
  private readonly groups = new Map<ReadIssueCode, { count: number; detailCount: number; details: ReadIssueDetail[] }>();
  static readonly detailLimit = 20;

  add(code: ReadIssueCode, detail: ReadIssueDetail, count = 1) {
    let group = this.groups.get(code);
    if (!group) {
      group = { count: 0, detailCount: 0, details: [] };
      this.groups.set(code, group);
    }
    group.count += count;
    group.detailCount++;
    if (group.details.length < ReadIssueCollector.detailLimit) group.details.push({
      ...detail,
      fields: Object.fromEntries(Object.entries(detail.fields).map(([key, value]) => [key, diagnosticValue(value)])),
    });
  }

  finish(): ReadIssue[] {
    return [...this.groups].map(([code, group]) => ({
      ...definitions[code], ...group, code, summary: definitions[code].summary(group.count),
    }));
  }
}

export function diagnosticValue(value: unknown): string {
  if (value === undefined) return "（缺失）";
  if (value === null) return "null";
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…（已截断）` : value || "（空字符串）";
  if (Array.isArray(value)) return `数组（${value.length} 项）`;
  if (typeof value === "object") return "对象";
  return String(value);
}

export class ReadDiagnosticError extends Error {
  readonly fields: Record<string, string>;
  constructor(message: string, fields: Record<string, string>) {
    super(message);
    this.name = "ReadDiagnosticError";
    this.fields = fields;
  }
}
