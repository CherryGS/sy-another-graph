import { normalizeKeyword } from "./prose";

interface TrieNode {
  next: Map<string, number>;
  failure: number;
  output: string | null;
  suffix: number;
}

export interface KeywordHit {
  keyword: string;
  start: number;
  end: number;
}

const WORD = /[\p{L}\p{N}\p{M}_]/u;
const IDEOGRAPH = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** One multi-pattern automaton; source text is scanned once, not per title. */
export class KeywordMatcher {
  private readonly nodes: TrieNode[] = [{ next: new Map(), failure: 0, output: null, suffix: 0 }];

  constructor(keywords: readonly string[]) {
    for (const keyword of keywords) {
      let state = 0;
      for (const char of keyword) {
        let next = this.nodes[state].next.get(char);
        if (next === undefined) {
          next = this.nodes.length;
          this.nodes[state].next.set(char, next);
          this.nodes.push({ next: new Map(), failure: 0, output: null, suffix: 0 });
        }
        state = next;
      }
      this.nodes[state].output = keyword;
    }
    const queue = [...this.nodes[0].next.values()];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const state = queue[cursor];
      for (const [char, next] of this.nodes[state].next) {
        let fallback = this.nodes[state].failure;
        while (fallback && !this.nodes[fallback].next.has(char)) fallback = this.nodes[fallback].failure;
        const failure = this.nodes[fallback].next.get(char) ?? 0;
        this.nodes[next].failure = failure;
        this.nodes[next].suffix = this.nodes[failure].output ? failure : this.nodes[failure].suffix;
        queue.push(next);
      }
    }
  }

  scan(text: string, limit: number): { hits: KeywordHit[]; truncated: boolean } {
    // Match normalized text while keeping offsets in the original readable prose.
    const starts: number[] = [];
    const ends: number[] = [];
    let normalized = "";
    for (const { segment, index } of GRAPHEMES.segment(text)) {
      const part = segment.normalize("NFKC");
      normalized += part;
      for (let unit = 0; unit < part.toLowerCase().length; unit++) {
        starts.push(index);
        ends.push(index + segment.length);
      }
    }
    normalized = normalized.toLowerCase();
    const matches: KeywordHit[] = [];
    let state = 0;
    let offset = 0;
    let truncated = false;
    outer: for (const char of normalized) {
      while (state && !this.nodes[state].next.has(char)) state = this.nodes[state].failure;
      state = this.nodes[state].next.get(char) ?? 0;
      offset += char.length;
      for (let output = state; output; output = this.nodes[output].suffix) {
        const keyword = this.nodes[output].output;
        if (!keyword) continue;
        const from = offset - keyword.length;
        const before = Array.from(normalized.slice(Math.max(0, from - 2), from)).at(-1) ?? "";
        const after = Array.from(normalized.slice(offset, offset + 2))[0] ?? "";
        const first = Array.from(keyword)[0];
        const last = Array.from(keyword).at(-1)!;
        const single = Array.from(keyword).length === 1;
        if ((single || !IDEOGRAPH.test(first)) && WORD.test(first) && WORD.test(before)) continue;
        if ((single || !IDEOGRAPH.test(last)) && WORD.test(last) && WORD.test(after)) continue;
        if (matches.length >= limit) { truncated = true; break outer; }
        matches.push({ keyword, start: starts[from], end: ends[offset - 1] });
      }
    }
    // Keep overlaps in the cache: an out-of-scope longer name must not suppress
    // an eligible shorter name. Scope-local evaluation chooses the longest hit.
    matches.sort((a, b) => a.start - b.start || b.end - a.end);
    return { hits: matches, truncated };
  }
}

export { normalizeKeyword };
