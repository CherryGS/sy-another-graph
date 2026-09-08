import type { GraphEdgeKind } from "./types";

export const NODE_TYPE_LABELS: Record<string, string> = {
  d: "文档",
  p: "段落",
  h: "标题",
  l: "列表",
  i: "列表项",
  b: "引述",
  s: "超级块",
  c: "代码块",
  m: "公式块",
  t: "表格",
  tb: "分隔线",
  html: "HTML",
  iframe: "嵌入页面",
  video: "视频",
  audio: "音频",
  widget: "挂件",
  query_embed: "嵌入查询",
  av: "数据库载体",
  database: "数据库",
  "database-item": "数据库条目",
};

export const EDGE_KIND_LABELS: Record<GraphEdgeKind, string> = {
  reference: "块引用",
  hierarchy: "包含关系",
  "database-embedding": "数据库载体",
  "database-membership": "数据库成员",
  "database-binding": "条目绑定",
  "database-relation": "关系字段",
};
