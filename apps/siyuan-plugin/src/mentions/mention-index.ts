import type { GraphEdge, GraphProvenance } from "../data/types";
import { KeywordMatcher, type KeywordHit } from "./matcher";
import { nativeNames, normalizeKeyword, ordinaryProse } from "./prose";
import {
  EMPTY_MENTION_PROGRESS, MENTION_LIMITS,
  type MentionBlock, type MentionEvidence, type MentionLimits, type MentionMode,
  type MentionProgress, type MentionResult, type MentionScope,
} from "./types";

interface CachedText {
  prose: string;
  signature: string;
  hits: KeywordHit[];
  limited: boolean;
}
interface KeywordTarget { id: string; name: string }
const PROSE_TYPES = new Set(["p", "h", "t"]);
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** Session-local derived data. Corpus revisions retain unchanged parsed text and
 * matches; vocabulary changes invalidate matches, never source identities. */
export class MentionIndex {
  private blocks = new Map<string, MentionBlock>();
  private names = new Map<string, string[]>();
  private targets = new Map<string, KeywordTarget[]>();
  private sources: MentionBlock[] = [];
  private roots = new Map<string, string[]>();
  private cache = new Map<string, CachedText>();
  private indexed = new Set<string>();
  private priority: string[] = [];
  private signature = "";
  private matcher = new KeywordMatcher([]);
  private limits: MentionLimits;
  progress: MentionProgress = { ...EMPTY_MENTION_PROGRESS };
  ready = false;

  constructor(limits: Partial<MentionLimits> = {}) {
    this.limits = { ...MENTION_LIMITS, ...limits };
  }

  replace(blocks: readonly MentionBlock[]): void {
    this.ready = false;
    this.blocks = new Map(blocks.map(block => [block.id, block]));
    if (this.blocks.size !== blocks.length) throw new Error("文本索引包含重复的原始块 ID");
    this.names = new Map();
    this.targets = new Map();
    this.roots = new Map();
    this.sources = [];
    this.indexed = new Set();
    this.priority = [];
    this.progress = { ...EMPTY_MENTION_PROGRESS };
    let keywordCharacters = 0;
    const rawTexts = new Set<string>();
    for (const block of blocks) {
      const names = nativeNames(block.title, block.ial);
      this.names.set(block.id, names.map(normalizeKeyword));
      const blockKeywords = new Set<string>();
      for (const name of names) {
        const keyword = normalizeKeyword(name);
        if (blockKeywords.has(keyword)) continue;
        blockKeywords.add(keyword);
        if (!keyword || keyword.length > 256 || !/[\p{L}\p{N}]/u.test(keyword)
          || keyword.includes("\uFFFC")) { this.progress.skippedKeywords++; continue; }
        let targets = this.targets.get(keyword);
        if (!targets) {
          if (this.targets.size >= this.limits.keywords || keywordCharacters + keyword.length > this.limits.keywordCharacters) {
            this.progress.skippedKeywords++;
            continue;
          }
          targets = [];
          this.targets.set(keyword, targets);
          keywordCharacters += keyword.length;
        }
        targets.push({ id: block.id, name });
      }
      if (!PROSE_TYPES.has(block.type)) continue;
      this.sources.push(block);
      const members = this.roots.get(block.rootId) ?? [];
      members.push(block.id);
      this.roots.set(block.rootId, members);
      if (block.markdown !== null && block.markdown.length <= this.limits.sourceCharacters) rawTexts.add(block.markdown);
    }
    for (const text of this.cache.keys()) if (!rawTexts.has(text)) this.cache.delete(text);
    const keywords = [...this.targets.keys()].sort();
    const signature = JSON.stringify(keywords);
    if (signature !== this.signature) {
      this.signature = signature;
      this.matcher = new KeywordMatcher(keywords);
    }
    this.progress.total = this.sources.length;
    this.progress.keywords = keywords.length;
  }

  prioritize(ids: readonly string[]): void {
    this.priority = ids.flatMap(id => this.blocks.get(id)?.type === "d" ? this.roots.get(id) ?? [] : [id]);
  }

  async warm(publish: (progress: MentionProgress) => void, signal: AbortSignal): Promise<void> {
    let cursor = 0;
    let cachedTerms = 0;
    const counted = new Set<string>();
    let lastPublished = 0;
    while (this.indexed.size < this.sources.length) {
      signal.throwIfAborted();
      const started = performance.now();
      do {
        const preferred = this.priority.pop();
        const block = preferred ? this.blocks.get(preferred) : this.sources[cursor++];
        if (!block || !PROSE_TYPES.has(block.type) || this.indexed.has(block.id)) continue;
        this.indexed.add(block.id);
        const raw = block.markdown;
        if (raw === null || raw.length > this.limits.sourceCharacters) this.progress.skippedSources++;
        else {
          let entry = this.cache.get(raw);
          if (counted.has(raw)) this.progress.cached++;
          else if (entry?.signature === this.signature && !entry.limited) {
            this.progress.cached++;
            const remaining = this.limits.cachedOccurrences - cachedTerms;
            if (entry.hits.length > remaining) {
              entry = { ...entry, hits: entry.hits.slice(0, remaining), limited: true };
              this.cache.set(raw, entry);
            }
          }
          else {
            const prose = entry?.prose ?? ordinaryProse(raw);
            const scan = this.matcher.scan(prose, this.limits.occurrencesPerSource);
            const terms = new Set<string>();
            const hits: KeywordHit[] = [];
            let limited = scan.truncated;
            for (const hit of scan.hits) {
              if ((!terms.has(hit.keyword) && terms.size >= this.limits.termsPerSource)
                || cachedTerms + hits.length >= this.limits.cachedOccurrences) {
                limited = true;
                continue;
              }
              terms.add(hit.keyword);
              hits.push(hit);
            }
            entry = { prose, hits, signature: this.signature, limited };
            this.cache.set(raw, entry);
          }
          if (!counted.has(raw)) { counted.add(raw); cachedTerms += entry!.hits.length; }
          if (entry!.limited) this.progress.limitedSources++;
        }
        this.progress.scanned++;
      } while (this.indexed.size < this.sources.length && performance.now() - started < 8);
      if (performance.now() - lastPublished >= 200) {
        publish({ ...this.progress });
        lastPublished = performance.now();
      }
      await pause();
    }
    signal.throwIfAborted();
    this.ready = true;
    publish({ ...this.progress });
  }

  async query(scope: MentionScope, mode: MentionMode, chosenIds: readonly string[], signal: AbortSignal): Promise<MentionResult> {
    signal.throwIfAborted();
    const result: MentionResult = { edges: [], truncated: false, ambiguousEdges: 0 };
    if (mode === "off" || (mode === "selected" && !chosenIds.length)) return result;
    const eligible = new Map(scope.entries.map(entry => [entry.id, entry]));
    const chosen = new Set(chosenIds);
    const explicit = new Set(scope.explicitPairs.map(([from, to]) => `${from}:${to}`));
    const targets = new Map<string, KeywordTarget[]>();
    const grouped = new Map<string, GraphEdge>();
    const touches = (id: string) => {
      const entry = eligible.get(id);
      return !!entry && (chosen.has(entry.displayId) || chosen.has(this.blocks.get(id)?.rootId ?? ""));
    };
    for (let offset = 0; offset < scope.entries.length; offset += 512) {
      signal.throwIfAborted();
      for (const source of scope.entries.slice(offset, offset + 512)) {
        const block = this.blocks.get(source.id);
        if (!block || !this.indexed.has(block.id) || block.markdown === null) continue;
        const text = this.cache.get(block.markdown);
        if (!text || text.signature !== this.signature) continue;
        const selfNames = new Set([...(this.names.get(block.id) ?? []), ...(this.names.get(block.rootId) ?? [])]);
        const sourceChosen = mode === "all" || touches(source.id);
        const accepted = new Map<string, { hit: KeywordHit; count: number; candidates: KeywordTarget[] }>();
        let acceptedEnd = -1;
        for (const hit of text.hits) {
          if (hit.start < acceptedEnd) continue;
          if (selfNames.has(hit.keyword)) continue;
          let candidates = targets.get(hit.keyword);
          if (!candidates) {
            candidates = (this.targets.get(hit.keyword) ?? []).filter(target => eligible.has(target.id));
            targets.set(hit.keyword, candidates);
          }
          // Single-character names use exact case and the matcher's two-sided
          // boundary rule. This avoids folding every article "a" into a title "A".
          const single = Array.from(hit.keyword).length === 1;
          const matching = single
            ? candidates.filter(target => target.name.normalize("NFKC") === text.prose.slice(hit.start, hit.end).normalize("NFKC"))
            : candidates;
          if (!matching.length) continue;
          // Resolve overlaps against scope before applying the selected/all view.
          acceptedEnd = hit.end;
          const hitKey = JSON.stringify([hit.keyword, single ? text.prose.slice(hit.start, hit.end) : ""]);
          const existing = accepted.get(hitKey);
          if (existing) existing.count++;
          else accepted.set(hitKey, { hit, count: 1, candidates: matching });
        }
        for (const { hit, count, candidates: matching } of accepted.values()) {
          for (const candidate of matching) {
            if (candidate.id === source.id || candidate.id === block.rootId || (!sourceChosen && !touches(candidate.id))) continue;
            const target = eligible.get(candidate.id)!;
            if (target.index === source.index) continue;
            const key = `${source.index}:${target.index}`;
            if (explicit.has(key)) continue;
            let edge = grouped.get(key);
            if (!edge) {
              if (grouped.size >= this.limits.edges) {
                result.truncated = true;
                result.edges = [...grouped.values()];
                result.ambiguousEdges = result.edges.filter(edge => edge.ambiguous).length;
                return result;
              }
              edge = { source: source.index, target: target.index, kind: "text-mention", weight: 0, provenance: [] };
              grouped.set(key, edge);
            }
            edge.weight += count;
            if (matching.length > 1) edge.ambiguous = true;
            if (edge.provenance!.length < this.limits.provenancePerEdge) {
              const provenance: GraphProvenance = {
                sourceId: source.id, targetId: candidate.id, kind: "text-mention", weight: count,
                mention: evidence(text.prose, hit, candidate.name, matching.length),
              };
              edge.provenance!.push(provenance);
            } else edge.omittedProvenance = (edge.omittedProvenance ?? 0) + 1;
          }
        }
      }
      await pause();
    }
    signal.throwIfAborted();
    result.edges = [...grouped.values()];
    result.ambiguousEdges = result.edges.filter(edge => edge.ambiguous).length;
    return result;
  }
}

function evidence(text: string, hit: KeywordHit, keyword: string, candidates: number): MentionEvidence {
  const from = Math.max(0, hit.start - 80);
  const to = Math.min(text.length, hit.end + 100);
  const prefix = from ? "…" : "";
  return {
    keyword,
    matched: text.slice(hit.start, hit.end),
    excerpt: prefix + text.slice(from, to).replaceAll("\uFFFC", "…") + (to < text.length ? "…" : ""),
    start: hit.start - from + prefix.length,
    end: hit.end - from + prefix.length,
    candidates,
  };
}
