import { describe, expect, it } from "vitest";
import { failureOf, isFailure, message, MessageError } from "./message";

describe("portable failures", () => {
  it("retains a structured failure across JSON transport and preserves upstream details", () => {
    const detail = message("source.invalidCount", { count: 12, cause: message("source.missing") });
    const transported: unknown = JSON.parse(JSON.stringify(failureOf(new MessageError(detail))));
    expect(isFailure(transported)).toBe(true);
    expect(transported).toEqual(detail);
    expect(failureOf(new Error("HTTP 503: upstream offline"))).toBe("HTTP 503: upstream offline");
  });
  it("rejects invalid codes, values and excessive nesting at protocol boundaries", () => {
    for (const value of [
      null,
      42,
      {},
      { code: "../file" },
      { code: "test", params: [] },
      { code: "test", params: { x: Infinity } },
      { code: "test", params: { x: null } },
    ])
      expect(isFailure(value)).toBe(false);
    let nested = message("test");
    for (let depth = 0; depth < 10; depth++) nested = message("test", { child: nested });
    expect(isFailure(nested)).toBe(false);
  });
});
