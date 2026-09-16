/** Portable, locale-independent text intent. Safe to send through a Worker. */
export interface Message {
  code: string;
  params?: Record<string, string | number | boolean | Message>;
}

export type Failure = string | Message;

/** Bound protocol validation prevents malformed or deeply nested host payloads. */
export function isFailure(value: unknown, depth = 0): value is Failure {
  if (typeof value === "string") return value.length <= 100_000;
  if (depth > 4 || !value || typeof value !== "object" || !("code" in value)) return false;
  if (typeof value.code !== "string" || !/^[a-zA-Z][\w.-]{0,159}$/.test(value.code)) return false;
  if (!("params" in value) || value.params === undefined) return true;
  if (!value.params || typeof value.params !== "object" || Array.isArray(value.params))
    return false;
  const entries = Object.entries(value.params);
  return (
    entries.length <= 20 &&
    entries.every(
      ([key, item]) =>
        /^[a-zA-Z]\w{0,39}$/.test(key) &&
        (typeof item === "boolean" ||
          (typeof item === "number" && Number.isFinite(item)) ||
          isFailure(item, depth + 1)),
    )
  );
}

export function message(code: string, params?: Message["params"]): Message {
  return params ? { code, params } : { code };
}

export class MessageError extends Error {
  readonly detail: Failure;
  constructor(detail: Failure, name = "MessageError") {
    super(typeof detail === "string" ? detail : detail.code);
    this.name = name;
    this.detail = detail;
  }
}

/** Keep unrecognized upstream errors verbatim; never infer their meaning. */
export function failureOf(error: unknown): Failure {
  if (error instanceof MessageError) return error.detail;
  return error instanceof Error ? error.message : String(error);
}
