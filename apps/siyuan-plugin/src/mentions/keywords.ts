export const KEYWORD_LENGTH_LIMIT = 256;
export const EXCLUDED_PHRASE_LIMIT = 2_000;

export function normalizeKeyword(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\u200B]+/g, " ").trim();
}

export function normalizeExcludedPhrases(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeKeyword).filter(Boolean))].sort();
}

/** Validate persisted/editor input without silently dropping unsupported rules. */
export function readExcludedPhrases(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > EXCLUDED_PHRASE_LIMIT ||
      !value.every(phrase => typeof phrase === "string")) return null;
  const phrases = normalizeExcludedPhrases(value);
  if (phrases.some(phrase => phrase.length > KEYWORD_LENGTH_LIMIT || Array.from(phrase).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159) || character === "\uFFFC";
  }))) return null;
  return phrases;
}
