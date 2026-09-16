import { message, type Message } from "../../core/diagnostics/message";
import {
  EXCLUDED_PHRASE_LIMIT,
  KEYWORD_LENGTH_LIMIT,
  normalizeExcludedPhrases,
  readExcludedPhrases,
} from "./keywords";

export const EXCLUDED_PATTERN_LIMIT = 128;
export const EXCLUSION_BUILD_TIMEOUT_MS = 10_000;

/** Persist separately so old literal /names/ never become regular expressions. */
export interface MentionExclusions {
  phrases: string[];
  patterns: string[];
}

export function normalizeExcludedPatterns(values: readonly string[]): string[] {
  // Regex source is code: lowercasing would turn \D into \d, for example.
  return [...new Set(values)].sort();
}

function validPatternLength(source: string): boolean {
  return (
    source.length > 0 && source.length <= KEYWORD_LENGTH_LIMIT && !/[\p{Cc}\uFFFC]/u.test(source)
  );
}

/** Syntax validation only. User patterns are never executed in the UI/host. */
export function readExcludedPatterns(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > EXCLUDED_PATTERN_LIMIT) return null;
  for (const source of value) {
    if (typeof source !== "string" || !validPatternLength(source)) return null;
    try {
      new RegExp(source, "iu");
    } catch {
      return null;
    }
  }
  return normalizeExcludedPatterns(value);
}

function limitMessage(): Message {
  return message("mentions.exclusionRuleLimit", {
    phrases: EXCLUDED_PHRASE_LIMIT,
    patterns: EXCLUDED_PATTERN_LIMIT,
    length: KEYWORD_LENGTH_LIMIT,
  });
}

export function parseExclusionDraft(
  draft: string,
): { value: MentionExclusions; error: null } | { value: null; error: Message } {
  const phrases: string[] = [];
  const patterns: string[] = [];
  const lines = draft.split(/\r\n?|\n/u);
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("/")) {
      if (line.length < 3 || !line.endsWith("/"))
        return {
          value: null,
          error: message("mentions.exclusionPatternSyntax", { line: index + 1 }),
        };
      const source = line.slice(1, -1);
      if (!validPatternLength(source)) return { value: null, error: limitMessage() };
      try {
        new RegExp(source, "iu");
      } catch (error) {
        return {
          value: null,
          error: message("mentions.invalidExclusionPattern", {
            line: index + 1,
            reason: error instanceof Error ? error.message : String(error),
          }),
        };
      }
      patterns.push(source);
    } else {
      // Escape a leading slash or backslash to express a literal rule.
      phrases.push(/^\\[/\\]/u.test(line) ? line.slice(1) : line);
    }
    if (phrases.length > EXCLUDED_PHRASE_LIMIT || patterns.length > EXCLUDED_PATTERN_LIMIT)
      return { value: null, error: limitMessage() };
  }
  const normalized = readExcludedPhrases(phrases);
  return normalized
    ? { value: { phrases: normalized, patterns: normalizeExcludedPatterns(patterns) }, error: null }
    : { value: null, error: limitMessage() };
}

export function formatExclusionDraft(
  phrases: readonly string[],
  patterns: readonly string[],
): string {
  return [
    ...phrases.map((phrase) => (/^[/\\]/u.test(phrase) ? `\\${phrase}` : phrase)),
    ...patterns.map((pattern) => `/${pattern}/`),
  ].join("\n");
}

export interface MatchedExclusionRule {
  kind: "phrase" | "pattern";
  source: string;
}

/** Worker-only matching. One decision per normalized name, even across homonyms. */
export function createExclusionRuleMatcher(
  phrases: readonly string[],
  patterns: readonly string[],
) {
  const literal = new Map(
    normalizeExcludedPhrases(phrases).map((source) => [
      source,
      { kind: "phrase", source } as const,
    ]),
  );
  const regexes = normalizeExcludedPatterns(patterns).map((source) => ({
    regex: new RegExp(source, "iu"),
    rule: { kind: "pattern", source } as const,
  }));
  const decisions = new Map<string, MatchedExclusionRule | null>();
  return (name: string): MatchedExclusionRule | null => {
    const phrase = literal.get(name);
    if (phrase) return phrase;
    if (!regexes.length || name.length > KEYWORD_LENGTH_LIMIT) return null;
    const cached = decisions.get(name);
    if (cached !== undefined) return cached;
    const excluded = regexes.find(({ regex }) => regex.test(name))?.rule ?? null;
    decisions.set(name, excluded);
    return excluded;
  };
}

export function createNameExclusionMatcher(
  phrases: readonly string[],
  patterns: readonly string[],
) {
  const match = createExclusionRuleMatcher(phrases, patterns);
  return (name: string) => match(name) !== null;
}
