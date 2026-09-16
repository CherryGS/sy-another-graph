import {
  createExclusionRuleMatcher,
  type MatchedExclusionRule,
  type MentionExclusions,
} from "./exclusions";
import { isMentionKeyword, normalizeKeyword } from "./keywords";
import { nativeNames } from "./names";

export const PREVIEW_PAGE_SIZE = 50;
export interface MentionNameSource {
  id: string;
  title: string;
  ial: string;
}
export interface ExclusionPreviewRow {
  id: string;
  name: string;
  keyword: string;
  rule: MatchedExclusionRule;
}
export interface ExclusionPreviewPage {
  matchedNames: number;
  matchedNodes: number;
  totalRows: number;
  filteredRows: number;
  offset: number;
  query: string;
  rows: ExclusionPreviewRow[];
}

/** Independent, name-only catalog. It never changes the applied mention index. */
export class ExclusionPreviewIndex {
  private names = new Map<string, { id: string; name: string }[]>();
  private rows: ExclusionPreviewRow[] = [];
  private filtered: ExclusionPreviewRow[] = [];
  private query = "";
  private matchedNames = 0;
  private matchedNodes = 0;

  load(blocks: readonly MentionNameSource[]): void {
    this.names.clear();
    for (const block of blocks) {
      const seen = new Set<string>();
      for (const name of nativeNames(block.title, block.ial)) {
        const keyword = normalizeKeyword(name);
        if (!isMentionKeyword(keyword) || seen.has(keyword)) continue;
        seen.add(keyword);
        const targets = this.names.get(keyword) ?? [];
        targets.push({ id: block.id, name });
        this.names.set(keyword, targets);
      }
    }
    this.rows = this.filtered = [];
    this.matchedNames = this.matchedNodes = 0;
    this.query = "";
  }

  preview(rules: MentionExclusions): ExclusionPreviewPage {
    const matches = createExclusionRuleMatcher(rules.phrases, rules.patterns);
    const nodes = new Set<string>();
    this.rows = [];
    this.matchedNames = 0;
    for (const [keyword, targets] of this.names) {
      const rule = matches(keyword);
      if (!rule) continue;
      this.matchedNames++;
      for (const target of targets) {
        nodes.add(target.id);
        this.rows.push({ ...target, keyword, rule });
      }
    }
    this.matchedNodes = nodes.size;
    this.filtered = this.rows;
    this.query = "";
    return this.page(0, "");
  }

  page(offset: number, query: string): ExclusionPreviewPage {
    const normalized = normalizeKeyword(query);
    if (normalized !== this.query) {
      this.query = normalized;
      this.filtered = normalized
        ? this.rows.filter((row) => row.keyword.includes(normalized) || row.id.includes(normalized))
        : this.rows;
    }
    const requested = Number.isSafeInteger(offset) ? Math.max(0, offset) : 0;
    const last =
      Math.max(0, Math.ceil(this.filtered.length / PREVIEW_PAGE_SIZE) - 1) * PREVIEW_PAGE_SIZE;
    const start = Math.min(Math.floor(requested / PREVIEW_PAGE_SIZE) * PREVIEW_PAGE_SIZE, last);
    return {
      matchedNames: this.matchedNames,
      matchedNodes: this.matchedNodes,
      totalRows: this.rows.length,
      filteredRows: this.filtered.length,
      offset: start,
      query: normalized,
      rows: this.filtered.slice(start, start + PREVIEW_PAGE_SIZE),
    };
  }
}
