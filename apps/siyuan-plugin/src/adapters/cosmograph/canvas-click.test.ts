import { describe, expect, it } from "vitest";
import { canvasClick } from "./canvas-click";

describe("canvas click meaning", () => {
  it("keeps modifier information for the owner's chosen-set rules", () => {
    expect(canvasClick("a", { shiftKey: true, detail: 1 })).toEqual({
      kind: "inspect",
      id: "a",
      event: { shiftKey: true, detail: 1 },
    });
  });
  it("opens a double-clicked node without sending a second selection mutation", () => {
    expect(canvasClick("a", { shiftKey: false, detail: 2 })).toEqual({
      kind: "open",
      id: "a",
    });
  });
  it("leaves Shift-double-click exit to the guarded blank-canvas listener", () => {
    expect(canvasClick(null, { shiftKey: true, detail: 2 })).toEqual({
      kind: "none",
    });
    expect(canvasClick("a", { shiftKey: true, detail: 2 })).toEqual({
      kind: "none",
    });
  });
});
