import { message as msg, MessageError, type Failure } from "./message";

export type ReadIssueCode =
  | "snapshot-changed"
  | "duplicate-blocks"
  | "reference-endpoints"
  | "database-identifier"
  | "database-read"
  | "database-budget"
  | "database-bindings"
  | "database-relations";

export interface ReadIssueDetail {
  fields: Record<string, Failure>;
  openBlockId?: string;
  openLabel?: Failure;
}

export interface ReadIssue {
  code: ReadIssueCode;
  count: number;
  detailCount: number;
  details: ReadIssueDetail[];
}

/** Keep exact totals while bounding diagnostic memory and modal/report size. */
export class ReadIssueCollector {
  private readonly groups = new Map<
    ReadIssueCode,
    { count: number; detailCount: number; details: ReadIssueDetail[] }
  >();
  static readonly detailLimit = 20;

  add(code: ReadIssueCode, detail: ReadIssueDetail, count = 1) {
    let group = this.groups.get(code);
    if (!group) {
      group = { count: 0, detailCount: 0, details: [] };
      this.groups.set(code, group);
    }
    group.count += count;
    group.detailCount++;
    if (group.details.length < ReadIssueCollector.detailLimit)
      group.details.push({
        ...detail,
        fields: Object.fromEntries(
          Object.entries(detail.fields).map(([key, value]) => [
            key,
            typeof value === "object" ? value : diagnosticValue(value),
          ]),
        ),
      });
  }

  finish(): ReadIssue[] {
    return [...this.groups].map(([code, group]) => ({
      ...group,
      code,
    }));
  }
}

export function diagnosticValue(value: unknown): Failure {
  if (value === undefined) return msg("text.missing");
  if (value === null) return "null";
  if (typeof value === "string")
    return value.length > 500
      ? msg("text.valueTruncated", { p0: value.slice(0, 500) })
      : value || msg("text.emptyString");
  if (Array.isArray(value)) return msg("text.arrayValueItems", { p0: value.length });
  if (typeof value === "object") return msg("text.object");
  return String(value);
}

export class ReadDiagnosticError extends MessageError {
  readonly fields: Record<string, Failure>;
  constructor(message: Failure, fields: Record<string, Failure>) {
    super(message);
    this.name = "ReadDiagnosticError";
    this.fields = fields;
  }
}
